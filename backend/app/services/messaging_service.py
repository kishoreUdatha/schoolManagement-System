"""Story 17.2 — Parent ↔ teacher messaging."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.models.academic import Section
from app.models.messaging import Conversation, Message
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User


ViewerRole = Literal["parent", "teacher"]


def _conversation_read_dict(
    db: Session,
    c: Conversation,
    *,
    viewer_role: ViewerRole,
    last_message: Optional[Message] = None,
) -> dict:
    parent = db.get(User, c.parent_user_id)
    teacher = db.get(User, c.teacher_user_id)
    student = db.get(Student, c.student_id)
    unread = c.parent_unread if viewer_role == "parent" else c.teacher_unread
    return {
        "id": c.id,
        "parent_user_id": c.parent_user_id,
        "parent_name": parent.full_name if parent else None,
        "teacher_user_id": c.teacher_user_id,
        "teacher_name": teacher.full_name if teacher else None,
        "student_id": c.student_id,
        "student_name": student.full_name if student else None,
        "last_message_at": c.last_message_at,
        "last_message_body": last_message.body if last_message else None,
        "unread_for_viewer": unread,
        "is_closed": c.closed_at is not None,
        "created_at": c.created_at,
    }


def _message_dict(db: Session, m: Message) -> dict:
    sender = db.get(User, m.sender_user_id) if m.sender_user_id else None
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "sender_user_id": m.sender_user_id,
        "sender_name": sender.full_name if sender else None,
        "sender_role": sender.role.value if sender else None,
        "body": m.body,
        "attachment_url": m.attachment_url,
        "is_read_by_recipient": m.is_read_by_recipient,
        "created_at": m.created_at,
    }


# ----- Parent-side -----

def _verify_parent_owns(
    db: Session, parent_user_id: int, student_id: int
) -> Student:
    link = db.execute(
        select(ParentStudent).where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not linked to this parent",
        )
    s = db.get(Student, student_id)
    if not s:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return s


def teachers_for_child(
    db: Session, parent_user_id: int, student_id: int
) -> list[dict]:
    """Return the teachers the parent can message — teachers of any subject
    in the child's current class, including the class teacher."""
    student = _verify_parent_owns(db, parent_user_id, student_id)
    section = db.get(Section, student.section_id)
    if not section:
        return []
    rows = db.execute(
        select(ClassSubject, Subject)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(
            ClassSubject.class_id == section.class_id,
            ClassSubject.teacher_user_id.is_not(None),
        )
    ).all()
    teacher_map: dict[int, dict] = {}
    for cs, subject in rows:
        t = teacher_map.setdefault(
            cs.teacher_user_id,
            {"teacher_user_id": cs.teacher_user_id, "subjects": [], "teacher_name": ""},
        )
        t["subjects"].append(subject.name)
    # Hydrate names + filter inactive
    out = []
    for tid, payload in teacher_map.items():
        u = db.get(User, tid)
        if not u or not u.is_active or u.role != UserRole.teacher:
            continue
        payload["teacher_name"] = u.full_name
        out.append(payload)
    # Add the section's class teacher if not already in
    if section.class_teacher_user_id and section.class_teacher_user_id not in teacher_map:
        u = db.get(User, section.class_teacher_user_id)
        if u and u.is_active and u.role == UserRole.teacher:
            out.append(
                {
                    "teacher_user_id": u.id,
                    "teacher_name": u.full_name,
                    "subjects": ["Class teacher"],
                }
            )
    out.sort(key=lambda x: x["teacher_name"])
    return out


def _get_or_create_conversation(
    db: Session,
    tenant_id: int,
    school_id: int,
    parent_user_id: int,
    teacher_user_id: int,
    student_id: int,
) -> Conversation:
    c = db.execute(
        select(Conversation).where(
            Conversation.parent_user_id == parent_user_id,
            Conversation.teacher_user_id == teacher_user_id,
            Conversation.student_id == student_id,
        )
    ).scalar_one_or_none()
    if c:
        return c
    c = Conversation(
        tenant_id=tenant_id,
        school_id=school_id,
        parent_user_id=parent_user_id,
        teacher_user_id=teacher_user_id,
        student_id=student_id,
    )
    db.add(c)
    db.flush()
    return c


def parent_start_or_send(
    db: Session,
    parent_user: User,
    teacher_user_id: int,
    student_id: int,
    body: str,
    attachment_url: Optional[str],
) -> tuple[Conversation, Message]:
    student = _verify_parent_owns(db, parent_user.id, student_id)
    teacher = db.get(User, teacher_user_id)
    if not teacher or teacher.role != UserRole.teacher or teacher.school_id != student.school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher not found in your child's school",
        )
    c = _get_or_create_conversation(
        db,
        student.tenant_id,
        student.school_id,
        parent_user.id,
        teacher_user_id,
        student_id,
    )
    m = _append_message(db, c, parent_user.id, body, attachment_url, sender_is_parent=True)
    db.commit()
    db.refresh(c)
    db.refresh(m)
    return c, m


def list_for_parent(
    db: Session, parent_user_id: int
) -> list[tuple[Conversation, Optional[Message]]]:
    convs = list(
        db.execute(
            select(Conversation)
            .where(Conversation.parent_user_id == parent_user_id)
            .order_by(Conversation.last_message_at.desc().nullslast())
        ).scalars().all()
    )
    out: list[tuple[Conversation, Optional[Message]]] = []
    for c in convs:
        last = db.execute(
            select(Message)
            .where(Message.conversation_id == c.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        out.append((c, last))
    return out


# ----- Teacher-side -----

def list_for_teacher(
    db: Session, teacher_user_id: int, *, include_closed: bool = False
) -> list[tuple[Conversation, Optional[Message]]]:
    stmt = select(Conversation).where(Conversation.teacher_user_id == teacher_user_id)
    if not include_closed:
        stmt = stmt.where(Conversation.closed_at.is_(None))
    convs = list(
        db.execute(
            stmt.order_by(Conversation.last_message_at.desc().nullslast())
        ).scalars().all()
    )
    out = []
    for c in convs:
        last = db.execute(
            select(Message)
            .where(Message.conversation_id == c.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        out.append((c, last))
    return out


def set_closed(db: Session, conversation_id: int, user, closed: bool):
    """Put a settled conversation away, or bring it back.

    Nothing is deleted: a parent can still open it and reply, and a reply
    reopens it. This is a teacher clearing their list, not ending the
    conversation on the family's behalf.
    """
    c = get_conversation_for_viewer(db, conversation_id, user.id)
    if closed and c.closed_at is None:
        c.closed_at = datetime.now(timezone.utc)
        c.closed_by_user_id = user.id
    elif not closed:
        c.closed_at = None
        c.closed_by_user_id = None
    db.commit()
    db.refresh(c)
    return c


def get_conversation_for_viewer(
    db: Session, conversation_id: int, viewer_user_id: int
) -> Conversation:
    c = db.get(Conversation, conversation_id)
    if not c:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    if c.parent_user_id != viewer_user_id and c.teacher_user_id != viewer_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your conversation"
        )
    return c


def list_messages(
    db: Session, conversation_id: int, viewer_user_id: int, *, limit: int = 200
) -> list[Message]:
    c = get_conversation_for_viewer(db, conversation_id, viewer_user_id)
    return list(
        db.execute(
            select(Message)
            .where(Message.conversation_id == c.id)
            .order_by(Message.created_at.asc())
            .limit(limit)
        ).scalars().all()
    )


def _append_message(
    db: Session,
    c: Conversation,
    sender_id: int,
    body: str,
    attachment_url: Optional[str],
    *,
    sender_is_parent: bool,
) -> Message:
    m = Message(
        tenant_id=c.tenant_id,
        school_id=c.school_id,
        conversation_id=c.id,
        sender_user_id=sender_id,
        body=body.strip(),
        attachment_url=attachment_url,
        is_read_by_recipient=False,
    )
    db.add(m)
    now = datetime.now(timezone.utc)
    c.last_message_at = now
    c.closed_at = None  # someone is talking again
    c.closed_by_user_id = None
    if sender_is_parent:
        c.teacher_unread = (c.teacher_unread or 0) + 1
    else:
        c.parent_unread = (c.parent_unread or 0) + 1
    db.flush()
    return m


def send_in_conversation(
    db: Session,
    conversation_id: int,
    sender: User,
    body: str,
    attachment_url: Optional[str],
) -> Message:
    c = get_conversation_for_viewer(db, conversation_id, sender.id)
    is_parent = sender.id == c.parent_user_id
    m = _append_message(db, c, sender.id, body, attachment_url, sender_is_parent=is_parent)
    db.commit()
    db.refresh(m)
    return m


def mark_read(
    db: Session, conversation_id: int, viewer_user_id: int
) -> Conversation:
    c = get_conversation_for_viewer(db, conversation_id, viewer_user_id)
    db.execute(
        Message.__table__.update()
        .where(
            Message.conversation_id == c.id,
            Message.sender_user_id != viewer_user_id,
            Message.is_read_by_recipient.is_(False),
        )
        .values(is_read_by_recipient=True)
    )
    if viewer_user_id == c.parent_user_id:
        c.parent_unread = 0
    else:
        c.teacher_unread = 0
    db.commit()
    db.refresh(c)
    return c
