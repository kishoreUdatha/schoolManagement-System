"""Story 22.1 — Audit log endpoints for school admin."""
import csv
import io
import json
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.core.enums import AuditAction
from app.database import get_db
from app.schemas.audit import AuditLogRead
from app.services import audit_service


router = APIRouter()


@router.get(
    "",
    response_model=list[AuditLogRead],
    summary="Audit log entries (most recent first)",
)
def list_(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    action: Optional[AuditAction] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    result: Optional[str] = Query(None, pattern="^(success|failed)$"),
):
    rows = audit_service.list_for_school(
        db,
        current_user.school_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
        result=result,
    )
    return [
        AuditLogRead.model_validate(audit_service.to_read_dict(db, a))
        for a in rows
    ]


@router.get(
    ".csv",
    response_class=PlainTextResponse,
    summary="CSV export of audit log entries",
)
def export_csv(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    action: Optional[AuditAction] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    limit: int = Query(500, ge=1, le=5000),
):
    rows = audit_service.list_for_school(
        db,
        current_user.school_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Timestamp",
            "Action",
            "Entity",
            "Entity ID",
            "User",
            "Email",
            "Role",
            "Path",
            "Old values",
            "New values",
        ]
    )
    for a in rows:
        d = audit_service.to_read_dict(db, a)
        writer.writerow(
            [
                d["created_at"].isoformat() if d["created_at"] else "",
                d["action"].value if hasattr(d["action"], "value") else d["action"],
                d["entity_type"],
                d["entity_id"] or "",
                d["user_name"] or "",
                d["user_email"] or "",
                d["user_role"] or "",
                d["request_path"] or "",
                json.dumps(d["old_values"]) if d["old_values"] else "",
                json.dumps(d["new_values"]) if d["new_values"] else "",
            ]
        )
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="audit_log.csv"'
        },
    )
