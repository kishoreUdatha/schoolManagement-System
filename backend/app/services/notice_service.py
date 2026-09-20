from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.enums import (
    NoticeAudience,
    NoticeChannel,
    NoticeStatus,
    RecipientStatus,
    UserRole,
)
from app.models.academic import SchoolClass, Section
from app.models.notice import Notice, NoticeRecipient
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User
from app.schemas.notice import NoticeCreate, NoticeUpdate


# Channels we actually dispatch in MVP. Others get rows with status=skipped.
_LIVE_CHANNELS = {NoticeChannel.in_app}


def _get(db: Session, notice_id: int, school_id: int) -> Notice:
    n = db.get(Notice, notice_id)
    if not n or n.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notice not found"
        )
    return n


def _validate_audience(
    db: Session,
    school_id: int,
    audience: NoticeAudience,
    class_id: Optional[int],
    section_id: Optional[int] = None,
    student_id: Optional[int] = None,
) -> None:
    if audience == NoticeAudience.class_parents:
        if not class_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="audience_class_id required for class_parents audience",
            )
        cls = db.get(SchoolClass, class_id)
        if not cls or cls.school_id != school_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Class not found for this school",
            )
    elif audience == NoticeAudience.section_parents:
        if not section_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="audience_section_id required for section_parents audience",
            )
        sec = db.get(Section, section_id)
        if not sec or sec.school_id != school_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Section not found for this school",
            )
    elif audience == NoticeAudience.single_parent:
        if not student_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="audience_student_id required for single_parent audience",
            )
        st = db.get(Student, student_id)
        if not st or st.school_id != school_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found for this school",
            )


def create(
    db: Session,
    tenant_id: int,
    school_id: int,
    created_by_user_id: int,
    data: NoticeCreate,
) -> Notice:
    _validate_audience(
        db,
        school_id,
        data.audience,
        data.audience_class_id,
        data.audience_section_id,
        data.audience_student_id,
    )
    n = Notice(
        tenant_id=tenant_id,
        school_id=school_id,
        title=data.title.strip(),
        body=data.body.strip(),
        audience=data.audience,
        audience_class_id=data.audience_class_id,
        audience_section_id=data.audience_section_id,
        audience_student_id=data.audience_student_id,
        channels=[c.value for c in data.channels],
        attachment_url=data.attachment_url,
        scheduled_at=data.scheduled_at,
        status=NoticeStatus.scheduled if data.scheduled_at else NoticeStatus.draft,
        created_by_user_id=created_by_user_id,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def _resolve_recipients(db: Session, n: Notice) -> list[User]:
    if n.audience == NoticeAudience.all_parents:
        stmt = select(User).where(
            User.school_id == n.school_id,
            User.role == UserRole.parent,
            User.is_active.is_(True),
        )
    elif n.audience == NoticeAudience.all_teachers:
        stmt = select(User).where(
            User.school_id == n.school_id,
            User.role == UserRole.teacher,
            User.is_active.is_(True),
        )
    elif n.audience == NoticeAudience.all_staff:
        stmt = select(User).where(
            User.school_id == n.school_id,
            User.role.in_([UserRole.teacher, UserRole.staff]),
            User.is_active.is_(True),
        )
    elif n.audience == NoticeAudience.class_parents:
        # Parents linked to students whose section is in this class
        stmt = (
            select(User)
            .distinct()
            .join(ParentStudent, ParentStudent.parent_user_id == User.id)
            .join(Student, ParentStudent.student_id == Student.id)
            .join(Section, Student.section_id == Section.id)
            .where(
                User.role == UserRole.parent,
                User.is_active.is_(True),
                Student.is_active.is_(True),
                Section.class_id == n.audience_class_id,
            )
        )
    elif n.audience == NoticeAudience.section_parents:
        stmt = (
            select(User)
            .distinct()
            .join(ParentStudent, ParentStudent.parent_user_id == User.id)
            .join(Student, ParentStudent.student_id == Student.id)
            .where(
                User.role == UserRole.parent,
                User.is_active.is_(True),
                Student.is_active.is_(True),
                Student.section_id == n.audience_section_id,
            )
        )
    elif n.audience == NoticeAudience.single_parent:
        stmt = (
            select(User)
            .distinct()
            .join(ParentStudent, ParentStudent.parent_user_id == User.id)
            .where(
                User.role == UserRole.parent,
                User.is_active.is_(True),
                ParentStudent.student_id == n.audience_student_id,
            )
        )
    else:
        return []
    return list(db.execute(stmt).scalars().all())


def send(db: Session, notice_id: int, school_id: int) -> Notice:
    n = _get(db, notice_id, school_id)
    if n.status == NoticeStatus.sent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Notice has already been sent",
        )

    recipients = _resolve_recipients(db, n)
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No users matched this audience",
        )

    from app.services import usage_service  # local to avoid cycle

    now = datetime.now(timezone.utc)
    channels = [NoticeChannel(c) for c in n.channels]

    # Aggregate counter bumps so we do one UPSERT per channel, not one per recipient
    counter_bumps: dict[str, int] = {}

    # Who has asked not to be sent this kind of thing, on this channel. One
    # query per channel rather than one per person, and it can only ever
    # return people for a category they are allowed to mute.
    from app.services import comms_settings_service

    muted: dict[NoticeChannel, set[int]] = {
        ch: comms_settings_service.muted_user_ids(
            db, [u.id for u in recipients], ch, n.category
        )
        for ch in channels
    }

    for user in recipients:
        for ch in channels:
            if user.id in muted[ch]:
                # Not a failure and not a skip: they were never a recipient
                # on this channel, so no row is written and nothing counts it
                # as undelivered.
                continue
            if ch in _LIVE_CHANNELS:
                rec = NoticeRecipient(
                    tenant_id=n.tenant_id,
                    school_id=n.school_id,
                    notice_id=n.id,
                    user_id=user.id,
                    channel=ch,
                    status=RecipientStatus.sent,
                    sent_at=now,
                )
            else:
                rec = NoticeRecipient(
                    tenant_id=n.tenant_id,
                    school_id=n.school_id,
                    notice_id=n.id,
                    user_id=user.id,
                    channel=ch,
                    status=RecipientStatus.skipped,
                    error="Provider not configured (MVP — wire SMS/email/WhatsApp module to enable)",
                )
            db.add(rec)
            # Count attempted dispatch — matches production billing model
            # where providers charge per request regardless of delivery.
            counter_bumps[ch.value] = counter_bumps.get(ch.value, 0) + 1

    for channel_name, count in counter_bumps.items():
        usage_service.increment_usage_counter(db, n.tenant_id, channel_name, n=count)

    n.status = NoticeStatus.sent
    n.sent_at = now
    db.commit()
    db.refresh(n)
    return n


def _delivery_breakdown(db: Session, notice_id: int) -> list[dict]:
    rows = db.execute(
        select(
            NoticeRecipient.channel,
            func.count().label("total"),
            func.sum(
                case((NoticeRecipient.status == RecipientStatus.sent, 1), else_=0)
            ).label("sent"),
            func.sum(
                case((NoticeRecipient.status == RecipientStatus.delivered, 1), else_=0)
            ).label("delivered"),
            func.sum(
                case((NoticeRecipient.status == RecipientStatus.failed, 1), else_=0)
            ).label("failed"),
            func.sum(
                case((NoticeRecipient.status == RecipientStatus.skipped, 1), else_=0)
            ).label("skipped"),
        )
        .where(NoticeRecipient.notice_id == notice_id)
        .group_by(NoticeRecipient.channel)
    ).all()
    return [
        {
            "channel": row.channel,
            "total": int(row.total or 0),
            "sent": int(row.sent or 0),
            "delivered": int(row.delivered or 0),
            "failed": int(row.failed or 0),
            "skipped": int(row.skipped or 0),
        }
        for row in rows
    ]


def to_read_dict(db: Session, n: Notice) -> dict:
    delivery = _delivery_breakdown(db, n.id)
    total = sum(d["total"] for d in delivery)
    # Recipient_count = distinct users for THIS notice
    distinct_users = db.execute(
        select(func.count(func.distinct(NoticeRecipient.user_id))).where(
            NoticeRecipient.notice_id == n.id
        )
    ).scalar_one()
    cls_name = None
    if n.audience_class_id:
        cls = db.get(SchoolClass, n.audience_class_id)
        cls_name = cls.name if cls else None
    section_label = None
    if n.audience_section_id:
        sec = db.get(Section, n.audience_section_id)
        if sec:
            sec_cls = db.get(SchoolClass, sec.class_id)
            section_label = f"{sec_cls.name} {sec.name}" if sec_cls else sec.name
    student_label = None
    if n.audience_student_id:
        st = db.get(Student, n.audience_student_id)
        if st:
            student_label = f"{st.full_name} ({st.admission_no})"
    return {
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "audience": n.audience,
        "audience_class_id": n.audience_class_id,
        "audience_class_name": cls_name,
        "audience_section_id": n.audience_section_id,
        "audience_section_label": section_label,
        "audience_student_id": n.audience_student_id,
        "audience_student_label": student_label,
        "channels": [NoticeChannel(c) for c in n.channels],
        "attachment_url": n.attachment_url,
        "scheduled_at": n.scheduled_at,
        "sent_at": n.sent_at,
        "status": n.status,
        "created_by_user_id": n.created_by_user_id,
        "created_at": n.created_at,
        "recipient_count": int(distinct_users or 0) or total,
        "delivery": delivery,
    }


def list_(
    db: Session,
    school_id: int,
    *,
    status_filter: Optional[str] = None,
    limit: int = 50,
) -> list[Notice]:
    stmt = (
        select(Notice)
        .where(Notice.school_id == school_id)
        .order_by(Notice.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(Notice.status == status_filter)
    return list(db.execute(stmt).scalars().all())


def get(db: Session, notice_id: int, school_id: int) -> Notice:
    return _get(db, notice_id, school_id)


def update(
    db: Session, notice_id: int, school_id: int, data: NoticeUpdate
) -> Notice:
    n = _get(db, notice_id, school_id)
    if n.status == NoticeStatus.sent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit a notice that has already been sent",
        )
    updates = data.model_dump(exclude_unset=True)
    if "channels" in updates:
        updates["channels"] = [c.value for c in data.channels or []]
    if (
        "audience" in updates
        or "audience_class_id" in updates
        or "audience_section_id" in updates
        or "audience_student_id" in updates
    ):
        new_aud = updates.get("audience", n.audience)
        new_cls = updates.get("audience_class_id", n.audience_class_id)
        new_sec = updates.get("audience_section_id", n.audience_section_id)
        new_st = updates.get("audience_student_id", n.audience_student_id)
        if isinstance(new_aud, str):
            new_aud = NoticeAudience(new_aud)
        _validate_audience(db, school_id, new_aud, new_cls, new_sec, new_st)
    for field, value in updates.items():
        setattr(n, field, value)
    if "scheduled_at" in updates:
        n.status = (
            NoticeStatus.scheduled if updates["scheduled_at"] else NoticeStatus.draft
        )
    db.commit()
    db.refresh(n)
    return n


def delete(db: Session, notice_id: int, school_id: int) -> None:
    n = _get(db, notice_id, school_id)
    db.delete(n)
    db.commit()


# --- Inbox (in-app for any logged-in user) ---

def list_inbox(
    db: Session, user_id: int, *, unread_only: bool = False, limit: int = 50
) -> list[dict]:
    stmt = (
        select(NoticeRecipient, Notice)
        .join(Notice, NoticeRecipient.notice_id == Notice.id)
        .where(
            NoticeRecipient.user_id == user_id,
            NoticeRecipient.channel == NoticeChannel.in_app,
        )
        .order_by(NoticeRecipient.sent_at.desc().nullslast())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(NoticeRecipient.read_at.is_(None))
    rows = db.execute(stmt).all()
    out = []
    for rec, n in rows:
        out.append(
            {
                "recipient_id": rec.id,
                "notice_id": n.id,
                "title": n.title,
                "body": n.body,
                "attachment_url": n.attachment_url,
                "sent_at": rec.sent_at,
                "read_at": rec.read_at,
                "status": rec.status,
            }
        )
    return out


def mark_read(db: Session, recipient_id: int, user_id: int) -> None:
    rec = db.get(NoticeRecipient, recipient_id)
    if not rec or rec.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inbox item not found"
        )
    if rec.read_at is None:
        rec.read_at = datetime.now(timezone.utc)
        db.commit()


def unread_count(db: Session, user_id: int) -> int:
    return db.execute(
        select(func.count(NoticeRecipient.id)).where(
            NoticeRecipient.user_id == user_id,
            NoticeRecipient.channel == NoticeChannel.in_app,
            NoticeRecipient.read_at.is_(None),
        )
    ).scalar_one()
