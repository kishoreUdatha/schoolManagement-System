"""In-app notices from the ERP modules (health visits, gate passes, hostel
outings, ...). Best-effort: a failure here never breaks the action that
triggered it. Uses the same Notice/NoticeRecipient rows as the notices
module, so messages show up in the parent/staff inbox."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import (
    NoticeAudience,
    NoticeChannel,
    NoticeStatus,
    NotificationCategory,
    RecipientStatus,
)
from app.models.notice import Notice, NoticeRecipient
from app.models.parent import ParentStudent
from app.models.student import Student


log = logging.getLogger("notify")


def _send(db: Session, *, tenant_id: int, school_id: int, user_ids: list[int], title: str, body: str,
          audience: NoticeAudience, student_id=None,
          category: NotificationCategory = NotificationCategory.general, link=None) -> int:
    if not user_ids:
        return 0
    now = datetime.now(timezone.utc)
    try:
        with db.begin_nested():
            n = Notice(
                tenant_id=tenant_id,
                school_id=school_id,
                title=title[:200],
                body=body,
                audience=audience,
                audience_student_id=student_id,
                category=category,
                link=link,
                channels=[NoticeChannel.in_app.value],
                status=NoticeStatus.sent,
                sent_at=now,
            )
            db.add(n)
            db.flush()
            for uid in dict.fromkeys(user_ids):
                db.add(
                    NoticeRecipient(
                        tenant_id=tenant_id,
                        school_id=school_id,
                        notice_id=n.id,
                        user_id=uid,
                        channel=NoticeChannel.in_app,
                        status=RecipientStatus.sent,
                        sent_at=now,
                    )
                )
            _queue_whatsapp(db, n, user_ids, audience, category)
        return len(set(user_ids))
    except Exception:  # noqa: BLE001
        log.exception("Couldn't send notice %r", title)
        return 0


def _queue_whatsapp(db: Session, n: Notice, user_ids: list[int], audience: NoticeAudience,
                    category: NotificationCategory) -> None:
    """Also send a family alert on WhatsApp when the school has connected
    WhatsApp and chosen to send this kind of message there. Staff-only
    notices stay in the app. People who switched WhatsApp off for this kind
    of message are left out."""
    if audience in (NoticeAudience.all_staff, NoticeAudience.all_teachers):
        return
    from app.services import comms_settings_service, whatsapp_service

    cfg = whatsapp_service.live_config(db, n.school_id)
    cat = category.value if hasattr(category, "value") else str(category)
    if cfg is None or cat not in (cfg.auto_categories or []):
        return
    muted = comms_settings_service.muted_user_ids(db, list(user_ids), NoticeChannel.whatsapp, category)
    wanted = [u for u in dict.fromkeys(user_ids) if u not in muted]
    if wanted:
        n.channels = [NoticeChannel.in_app.value, NoticeChannel.whatsapp.value]
        whatsapp_service.queue_for_notice(db, n, wanted)


def student_parents(db: Session, student: Student, title: str, body: str, *,
                    category: NotificationCategory = NotificationCategory.general, link=None) -> int:
    """Notify every parent linked to the student. Caller commits.

    `category` lets the parent filter (and mute) it; `link` is the in-app path
    the parent app opens when the notice is tapped."""
    parents = list(
        db.execute(select(ParentStudent.parent_user_id).where(ParentStudent.student_id == student.id)).scalars()
    )
    return _send(
        db,
        tenant_id=student.tenant_id,
        school_id=student.school_id,
        user_ids=parents,
        title=title,
        body=body,
        audience=NoticeAudience.single_parent,
        student_id=student.id,
        category=category,
        link=link,
    )


def staff_users(db: Session, *, tenant_id: int, school_id: int, user_ids: list[int], title: str, body: str) -> int:
    """Notify specific staff members. Caller commits."""
    return _send(
        db, tenant_id=tenant_id, school_id=school_id, user_ids=user_ids, title=title, body=body,
        audience=NoticeAudience.all_staff,
    )


def broadcast(db: Session, *, tenant_id: int, school_id: int, audience: NoticeAudience, title: str, body: str,
              class_id=None, section_id=None, student_id=None,
              category: NotificationCategory = NotificationCategory.general, link=None) -> int:
    """Send to a notice audience (all parents, a class, a section...) using the
    notices module's own recipient rules. Caller commits."""
    from app.services.notice_service import _resolve_recipients

    probe = Notice(tenant_id=tenant_id, school_id=school_id, title=title, body=body, audience=audience,
                   audience_class_id=class_id, audience_section_id=section_id, audience_student_id=student_id,
                   channels=[NoticeChannel.in_app.value], status=NoticeStatus.sent)
    users = [u.id for u in _resolve_recipients(db, probe)]
    return _send(db, tenant_id=tenant_id, school_id=school_id, user_ids=users, title=title, body=body,
                 audience=audience, student_id=student_id, category=category, link=link) if users else 0
