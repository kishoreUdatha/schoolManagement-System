"""The school's rules about passwords, second factors and what it may send.

Everything here is read by something that enforces it. That is the point of
the file: a settings screen listing rules nothing checks tells an
administrator the school is protected when it is not, which is worse than
having no screen at all.
"""
from __future__ import annotations

import secrets
import string
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import (
    NoticeChannel,
    NotificationCategory,
    TwoFactorScope,
    UserRole,
)
from app.models.comms_settings import (
    NotificationPreference,
    NotificationTemplate,
    SecurityPolicy,
)
from app.models.user import User

# Messages a parent may not switch off.
#
# Attendance, because "your child is not in school" is the school telling you
# it does not know where your child is — a parent who muted that and found out
# at four o'clock would be right to be furious.
#
# Fees, because it is the school's evidence that it told you before a place
# was lost over arrears. A preference must not become a defence.
#
# Everything else is genuinely the parent's choice.
LOCKED: frozenset[NotificationCategory] = frozenset(
    {NotificationCategory.attendance, NotificationCategory.fees}
)

# The in-app channel is the record, not a push. Silencing it would leave a
# message existing nowhere the parent can go and find it, so it is never a
# choice on any category.
LOCKED_CHANNELS: frozenset[NoticeChannel] = frozenset({NoticeChannel.in_app})


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


# ---------- the policy ----------


def policy(db: Session, school_id: int) -> SecurityPolicy:
    """The school's rules, creating the default row on first read.

    Defaults rather than nulls-everywhere, so a school that has never opened
    the screen still has an eight-character minimum rather than none.
    """
    row = db.execute(
        select(SecurityPolicy).where(SecurityPolicy.school_id == school_id)
    ).scalar_one_or_none()
    if row is None:
        from app.models.tenant import School

        school = db.get(School, school_id)
        if not school:
            raise _404("School")
        row = SecurityPolicy(tenant_id=school.tenant_id, school_id=school_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def update_policy(db: Session, school_id: int, data: dict) -> SecurityPolicy:
    row = policy(db, school_id)
    for field, value in data.items():
        if value is not None or field in {
            "password_expiry_days", "max_failed_attempts",
            "lockout_minutes", "session_timeout_minutes",
        }:
            setattr(row, field, value)
    if row.min_password_length < 8:
        # Below eight a policy screen is theatre; refuse rather than store a
        # number that makes the school look configured and safer than it is.
        raise _400("A password minimum below eight characters is not a policy.")
    if row.min_password_length > 64:
        raise _400("Sixty-four characters is the most that can be required.")
    db.commit()
    db.refresh(row)
    return row


def policy_summary(db: Session, school_id: int) -> dict:
    """The rules in the words a person would be shown when they break one."""
    p = policy(db, school_id)
    rules = [f"at least {p.min_password_length} characters"]
    if p.require_mixed_case:
        rules.append("an upper and a lower case letter")
    if p.require_number:
        rules.append("a number")
    if p.require_symbol:
        rules.append("a symbol")
    return {
        "min_password_length": p.min_password_length,
        "require_mixed_case": p.require_mixed_case,
        "require_number": p.require_number,
        "require_symbol": p.require_symbol,
        "password_expiry_days": p.password_expiry_days,
        "max_failed_attempts": p.max_failed_attempts,
        "lockout_minutes": p.lockout_minutes,
        "session_timeout_minutes": p.session_timeout_minutes,
        "require_2fa_for": p.require_2fa_for.value,
        "rules": rules,
    }


def validate_password(db: Session, school_id: Optional[int], password: str) -> None:
    """Check a password against the school's own rules.

    The single place a password is judged. Both the change and the reset path
    come through here, so a school that tightens its policy tightens both at
    once rather than one of them.

    The refusal names what is missing. "Password not strong enough" makes
    somebody guess at a rule they cannot see.
    """
    if school_id is None:
        # Platform operators have no school; the built-in floor still applies.
        if len(password) < 8:
            raise _400("A password needs at least eight characters.")
        return

    p = policy(db, school_id)
    missing: list[str] = []

    if len(password) < p.min_password_length:
        missing.append(f"at least {p.min_password_length} characters")
    if p.require_mixed_case and not (
        any(c.islower() for c in password) and any(c.isupper() for c in password)
    ):
        missing.append("an upper and a lower case letter")
    if p.require_number and not any(c.isdigit() for c in password):
        missing.append("a number")
    if p.require_symbol and not any(c in string.punctuation for c in password):
        missing.append("a symbol")

    if missing:
        if len(missing) == 1:
            raise _400(f"That password needs {missing[0]}.")
        raise _400(
            "That password needs " + ", ".join(missing[:-1]) + f" and {missing[-1]}."
        )


def needs_second_factor(db: Session, user: User) -> bool:
    """Whether this person must finish a sign-in with a code."""
    if user.school_id is None:
        return False
    scope = policy(db, user.school_id).require_2fa_for
    if scope == TwoFactorScope.everybody:
        return True
    if scope == TwoFactorScope.parents:
        return user.role == UserRole.parent
    if scope == TwoFactorScope.staff:
        return user.role != UserRole.parent and user.role != UserRole.student
    return False


# ---------- what a person is willing to receive ----------


def preferences(db: Session, user: User) -> dict:
    """Every channel and category, with what this person has chosen.

    Returns the whole grid rather than only the rows that exist, because the
    absence of a row is itself the answer — and a screen that only showed
    stored rows would open blank for everybody who has never changed one.
    """
    saved = {
        (row.channel, row.category): row.is_enabled
        for row in db.execute(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user.id
            )
        ).scalars()
    }

    rows = []
    for channel in NoticeChannel:
        for category in NotificationCategory:
            locked = category in LOCKED or channel in LOCKED_CHANNELS
            rows.append({
                "channel": channel.value,
                "category": category.value,
                # No row means yes. Opt-out, not opt-in.
                "is_enabled": True if locked else saved.get((channel, category), True),
                "locked": locked,
                "locked_because": (
                    "The school has to be able to reach you about this."
                    if category in LOCKED
                    else "This is where the message is kept, so it is always on."
                    if channel in LOCKED_CHANNELS
                    else None
                ),
            })
    return {
        "user_id": user.id,
        "rows": rows,
        "locked_categories": sorted(c.value for c in LOCKED),
        "locked_channels": sorted(c.value for c in LOCKED_CHANNELS),
    }


def set_preference(db: Session, user: User, channel: NoticeChannel,
                   category: NotificationCategory, enabled: bool) -> dict:
    """Record a choice, refusing the ones that are not choices."""
    if not enabled and category in LOCKED:
        raise _400(
            f"{category.value.capitalize()} messages cannot be switched off — "
            "the school has to be able to reach you about them."
        )
    if not enabled and channel in LOCKED_CHANNELS:
        raise _400(
            "In-app messages cannot be switched off; that is where they are kept."
        )

    row = db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user.id,
            NotificationPreference.channel == channel,
            NotificationPreference.category == category,
        )
    ).scalar_one_or_none()

    if enabled:
        # Back to the default, so there is no row to go stale.
        if row is not None:
            db.delete(row)
            db.commit()
    else:
        if row is None:
            db.add(NotificationPreference(
                tenant_id=user.tenant_id, school_id=user.school_id,
                user_id=user.id, channel=channel, category=category,
                is_enabled=False,
            ))
        else:
            row.is_enabled = False
        db.commit()
    return preferences(db, user)


def wants(db: Session, user_id: int, channel: NoticeChannel,
          category: NotificationCategory) -> bool:
    """Whether to send this person this message on this channel.

    Consulted by the sender. Defaults to yes for everything it has never been
    told about, and always yes for the categories and channels nobody may
    mute.
    """
    if category in LOCKED or channel in LOCKED_CHANNELS:
        return True
    row = db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user_id,
            NotificationPreference.channel == channel,
            NotificationPreference.category == category,
        )
    ).scalar_one_or_none()
    return True if row is None else row.is_enabled


def muted_user_ids(db: Session, user_ids: Iterable[int], channel: NoticeChannel,
                   category: NotificationCategory) -> set[int]:
    """The subset of these people who have said no — one query, not N."""
    if category in LOCKED or channel in LOCKED_CHANNELS:
        return set()
    ids = list(user_ids)
    if not ids:
        return set()
    return set(db.execute(
        select(NotificationPreference.user_id).where(
            NotificationPreference.user_id.in_(ids),
            NotificationPreference.channel == channel,
            NotificationPreference.category == category,
            NotificationPreference.is_enabled.is_(False),
        )
    ).scalars())


# ---------- the wording a school reuses ----------


def list_templates(db: Session, school_id: int) -> list[NotificationTemplate]:
    return list(db.execute(
        select(NotificationTemplate)
        .where(NotificationTemplate.school_id == school_id)
        .order_by(NotificationTemplate.name)
    ).scalars())


def _get_template(db: Session, school_id: int, template_id: int) -> NotificationTemplate:
    row = db.get(NotificationTemplate, template_id)
    if not row or row.school_id != school_id:
        raise _404("Template")
    return row


def create_template(db: Session, tenant_id: int, school_id: int, data: dict) -> NotificationTemplate:
    clash = db.execute(
        select(NotificationTemplate).where(
            NotificationTemplate.school_id == school_id,
            NotificationTemplate.code == data["code"],
        )
    ).scalar_one_or_none()
    if clash:
        raise _400("A template with that code already exists.")
    row = NotificationTemplate(tenant_id=tenant_id, school_id=school_id, **data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_template(db: Session, school_id: int, template_id: int, data: dict) -> NotificationTemplate:
    row = _get_template(db, school_id, template_id)
    for field, value in data.items():
        if value is not None:
            setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


def delete_template(db: Session, school_id: int, template_id: int) -> None:
    db.delete(_get_template(db, school_id, template_id))
    db.commit()


def render(template: NotificationTemplate, values: dict) -> dict:
    """Fill a template in, leaving anything unknown visibly unfilled.

    An unresolved {placeholder} stays as it is rather than becoming an empty
    string: a message reading "Dear , your fees" is a bug somebody has to
    notice, and a blank is easy to miss in a list of two hundred.
    """
    def fill(text: Optional[str]) -> Optional[str]:
        if not text:
            return text
        out = text
        for key, value in values.items():
            out = out.replace("{" + key + "}", "" if value is None else str(value))
        return out

    body = fill(template.body) or ""
    return {
        "subject": fill(template.subject),
        "body": body,
        "unfilled": sorted(set(
            part.split("}")[0]
            for part in body.split("{")[1:]
            if "}" in part
        )),
    }
