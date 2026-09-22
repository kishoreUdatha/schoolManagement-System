"""Getting back in, and proving it is you.

Three things: a forgotten password, a one-time code as a second factor, and
the first sign-in after somebody else has typed your password for you.

Two rules run through all of it.

Nothing here tells an anonymous caller whether an account exists. "No such
email" is a sentence that turns a login form into a way of finding out who
banks, studies or works somewhere, so every path below answers the same way
whether the address was real or not.

And a code is a secret. It is stored hashed, checked in constant time, dies
after a few minutes, dies on first use, and dies after a handful of wrong
guesses — otherwise six digits is a number you can simply count up to.
"""
from __future__ import annotations

import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import NoticeChannel, OtpPurpose, UserRole
from app.core.security import hash_password, verify_password
from app.models.user import User, UserOtp

# Short enough that a stolen code is stale before it is useful, long enough
# that somebody can finish reading an email and type it.
CODE_MINUTES = 10
RESET_MINUTES = 30
MAX_ATTEMPTS = 5

# Six digits is what people expect and can read over a phone. The guess limit
# is what makes it safe, not the length.
CODE_DIGITS = 6


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_code() -> str:
    return f"{secrets.randbelow(10 ** CODE_DIGITS):0{CODE_DIGITS}d}"


def _new_token() -> str:
    """A reset link's secret. Long and random, because unlike a typed code it
    is never read aloud, so there is no reason to make it short."""
    return secrets.token_urlsafe(32)


def _issue(db: Session, user: User, purpose: OtpPurpose, minutes: int) -> str:
    """Make a code, store only its hash, and retire anything outstanding.

    Retiring the old one matters: two live reset codes means a code somebody
    was sent an hour ago still works after they asked for another because the
    first never arrived.
    """
    db.execute(
        UserOtp.__table__.update()
        .where(
            UserOtp.user_id == user.id,
            UserOtp.purpose == purpose,
            UserOtp.used_at.is_(None),
        )
        .values(used_at=_now())
    )
    secret = _new_token() if purpose == OtpPurpose.password_reset else _new_code()
    db.add(UserOtp(
        user_id=user.id,
        otp_hash=hash_password(secret),
        purpose=purpose,
        expires_at=_now() + timedelta(minutes=minutes),
    ))
    db.commit()
    return secret


def _spend(db: Session, user: User, secret: str, purpose: OtpPurpose) -> bool:
    """Check a code and use it up. Returns False for every kind of failure.

    Counting wrong guesses on the row rather than in memory means the limit
    survives a restart, and survives the attacker moving to another process.
    """
    row = db.execute(
        select(UserOtp)
        .where(
            UserOtp.user_id == user.id,
            UserOtp.purpose == purpose,
            UserOtp.used_at.is_(None),
        )
        .order_by(UserOtp.created_at.desc())
    ).scalars().first()

    if row is None or row.expires_at < _now():
        return False
    if row.attempts >= MAX_ATTEMPTS:
        # Burn it rather than leave it lying there being guessed at.
        row.used_at = _now()
        db.commit()
        return False

    if not verify_password(secret, row.otp_hash):
        row.attempts += 1
        db.commit()
        return False

    row.used_at = _now()
    db.commit()
    return True


def _find(db: Session, email: str, role: Optional[UserRole] = None) -> Optional[User]:
    stmt = select(User).where(
        User.email.is_not(None),
        User.is_active.is_(True),
    )
    users = list(db.execute(stmt).scalars())
    # Compared in constant time so the lookup does not leak which addresses
    # exist through how long it took to answer.
    match = None
    for u in users:
        if u.email and hmac.compare_digest(u.email.lower(), email.strip().lower()):
            if role is None or u.role == role:
                match = u
    return match


def validate_password(db: Session, school_id, password: str) -> None:
    """The school's own password rules, read at the moment they are needed.

    Imported lazily because comms_settings_service reads a policy row, and a
    module-level import would make the two files depend on each other's
    import order for no gain.
    """
    from app.services import comms_settings_service

    comms_settings_service.validate_password(db, school_id, password)


# ---------- forgotten password ----------


def request_reset(db: Session, email: str, role: Optional[UserRole] = None) -> Optional[tuple[User, str]]:
    """Start a reset. Returns the token for the caller to deliver, or None.

    The route above this must answer the same way either way. Returning None
    for an unknown address is for the sender's benefit, not the caller's.
    """
    user = _find(db, email, role)
    if user is None:
        return None
    token = _issue(db, user, OtpPurpose.password_reset, RESET_MINUTES)
    return user, token


def complete_reset(db: Session, email: str, token: str, new_password: str) -> None:
    user = _find(db, email)
    if not user:
        # Same refusal as a bad token, for the same reason.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That reset link is not valid any more.")
    validate_password(db, user.school_id, new_password)
    if not _spend(db, user, token, OtpPurpose.password_reset):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That reset link is not valid any more.")

    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    db.commit()


# ---------- second factor ----------


def issue_login_code(db: Session, user: User) -> tuple[str, str]:
    """Start a second factor. Returns (challenge, code).

    The challenge is what the half-finished sign-in carries back to us; the
    code is what the person types. They are separate so the thing travelling
    in the clear through a browser is not the thing that proves identity.
    """
    code = _issue(db, user, OtpPurpose.login_2fa, CODE_MINUTES)
    row = db.execute(
        select(UserOtp)
        .where(
            UserOtp.user_id == user.id,
            UserOtp.purpose == OtpPurpose.login_2fa,
            UserOtp.used_at.is_(None),
        )
        .order_by(UserOtp.created_at.desc())
    ).scalars().first()
    row.challenge = secrets.token_urlsafe(24)
    db.commit()
    return row.challenge, code


def user_for_challenge(db: Session, challenge: str) -> Optional[User]:
    """Who a half-finished sign-in belongs to, or None.

    None for an expired, spent or invented challenge alike — the caller must
    answer all three the same way, or the endpoint becomes a way of asking
    whether a given handle was ever real.
    """
    row = db.execute(
        select(UserOtp).where(
            UserOtp.challenge == challenge,
            UserOtp.purpose == OtpPurpose.login_2fa,
            UserOtp.used_at.is_(None),
        )
    ).scalar_one_or_none()
    if row is None or row.expires_at < _now():
        return None
    return db.get(User, row.user_id)


def check_login_code(db: Session, user: User, code: str) -> None:
    if not _spend(db, user, code, OtpPurpose.login_2fa):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "That code is wrong or has expired. Ask for a new one.",
        )


# ---------- the first sign-in after somebody else typed your password ----------


def change_password(db: Session, user: User, current: str, new: str) -> None:
    """Used by every role's own settings page, and by the forced change."""
    if not user.password_hash or not verify_password(current, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That is not your current password.")
    validate_password(db, user.school_id, new)
    if hmac.compare_digest(current, new):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The new password is the same as the old one.")
    user.password_hash = hash_password(new)
    user.must_change_password = False
    db.commit()


def require_change(db: Session, user: User) -> None:
    """Mark an account as needing a new password at next sign-in. Called
    wherever somebody sets a password on another person's behalf."""
    user.must_change_password = True
    db.commit()


# ---------- delivery ----------


def deliver(db: Session, user: User, subject: str, body: str) -> str:
    """Hand a one-time code (password reset, sign-in code) to a channel that
    can carry it privately, and say which one; "none" when there is none.

    Such a code must never become a school notice: notices are listed to the
    office (the Announcements screen shows their text), so the code would be
    readable by someone other than its owner. And an in-app message is no use
    for it anyway: a person who has forgotten their password, or is halfway
    through signing in, cannot open their inbox. There is no mailer or SMS
    gateway wired into this deployment yet, so nothing is sent; callers tell
    the person to ask the school office instead.
    """
    return "none"
