"""Story 22.1 — Query API for the audit log."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AuditAction
from app.models.audit import AuditLog
from app.models.user import User


def list_for_school(
    db: Session,
    school_id: int,
    *,
    action: Optional[AuditAction] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    user_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    limit: int = 200,
    offset: int = 0,
    result: Optional[str] = None,
) -> list[AuditLog]:
    stmt = (
        select(AuditLog)
        .where(AuditLog.school_id == school_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if result:
        stmt = stmt.where(AuditLog.result == result)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if from_date is not None:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date is not None:
        stmt = stmt.where(AuditLog.created_at < datetime.combine(to_date, datetime.max.time()))
    return list(db.execute(stmt).scalars().all())


def _scope(db: Session, school_id: Optional[int]) -> str:
    """Where the change applied: the school (campus) it belongs to."""
    from app.models.tenant import School

    if not school_id:
        return "Platform"
    s = db.get(School, school_id)
    return s.name if s else f"School #{school_id}"


def to_read_dict(db: Session, a: AuditLog) -> dict:
    user = db.get(User, a.user_id) if a.user_id else None
    return {
        "id": a.id,
        "action": a.action,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "user_id": a.user_id,
        "user_name": user.full_name if user else None,
        "user_email": user.email if user else None,
        "user_role": user.role.value if user else None,
        "request_path": a.request_path,
        "result": a.result,
        "scope": _scope(db, a.school_id),
        "old_values": a.old_values,
        "new_values": a.new_values,
        "created_at": a.created_at,
    }
