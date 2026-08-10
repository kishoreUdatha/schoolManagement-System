"""Story 19.2 — Principal approval workflow.

Generic request/decide model with per-kind apply handlers. Only
result_publishing has a working apply implementation today; the other kinds
record an approval/rejection but don't mutate downstream records (those wire
into per-module logic in their own stories).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import ApprovalKind, ApprovalStatus, UserRole
from app.models.approval import ApprovalRequest
from app.models.exam import Exam
from app.models.user import User
from app.schemas.approval import ApprovalCreate, ApprovalDecide


def _user_name(db: Session, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    u = db.get(User, user_id)
    return u.full_name if u else None


def to_read_dict(db: Session, a: ApprovalRequest) -> dict:
    return {
        "id": a.id,
        "kind": a.kind,
        "status": a.status,
        "requested_by_user_id": a.requested_by_user_id,
        "requested_by_name": _user_name(db, a.requested_by_user_id),
        "reason": a.reason,
        "payload": a.payload or {},
        "reviewed_by_user_id": a.reviewed_by_user_id,
        "reviewed_by_name": _user_name(db, a.reviewed_by_user_id),
        "decision_remark": a.decision_remark,
        "decided_at": a.decided_at,
        "created_at": a.created_at,
    }


def create_request(
    db: Session,
    tenant_id: int,
    school_id: int,
    requester_user_id: int,
    data: ApprovalCreate,
) -> ApprovalRequest:
    a = ApprovalRequest(
        tenant_id=tenant_id,
        school_id=school_id,
        kind=data.kind,
        status=ApprovalStatus.pending,
        requested_by_user_id=requester_user_id,
        reason=data.reason,
        payload=data.payload or {},
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def list_(
    db: Session,
    school_id: int,
    *,
    status_filter: Optional[ApprovalStatus] = None,
    kind: Optional[ApprovalKind] = None,
    limit: int = 100,
) -> list[ApprovalRequest]:
    stmt = (
        select(ApprovalRequest)
        .where(ApprovalRequest.school_id == school_id)
        .order_by(
            # Pending first, then most-recent decisions
            ApprovalRequest.status,
            ApprovalRequest.created_at.desc(),
        )
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(ApprovalRequest.status == status_filter)
    if kind:
        stmt = stmt.where(ApprovalRequest.kind == kind)
    return list(db.execute(stmt).scalars().all())


def get(db: Session, approval_id: int, school_id: int) -> ApprovalRequest:
    a = db.get(ApprovalRequest, approval_id)
    if not a or a.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found"
        )
    return a


def decide(
    db: Session,
    approval_id: int,
    school_id: int,
    reviewer_user_id: int,
    data: ApprovalDecide,
) -> ApprovalRequest:
    a = get(db, approval_id, school_id)
    if a.status != ApprovalStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Approval is already {a.status.value}",
        )
    if data.status not in (ApprovalStatus.approved, ApprovalStatus.rejected):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Decision must be approved or rejected",
        )

    # If approving, attempt to apply the change BEFORE committing the
    # approval. If the apply fails, the approval stays pending and the
    # principal sees a clear error.
    if data.status == ApprovalStatus.approved:
        _apply(db, a)

    a.status = data.status
    a.reviewed_by_user_id = reviewer_user_id
    a.decision_remark = data.decision_remark
    a.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return a


# ----- Apply handlers -----

def _apply(db: Session, a: ApprovalRequest) -> None:
    """Mutate downstream records to enact the approved request."""
    if a.kind == ApprovalKind.result_publishing:
        _apply_result_publishing(db, a)
    elif a.kind == ApprovalKind.marks_correction:
        # Hook for a future story — record the approval but don't auto-apply.
        # Teachers will edit the mark manually once approved.
        return
    elif a.kind == ApprovalKind.attendance_edit:
        # Same — kept as workflow record, application will come from the
        # attendance module when it integrates with approvals.
        return
    elif a.kind == ApprovalKind.staff_leave:
        # Wired in once Story 8.2 lands the Leave model.
        return


def _apply_result_publishing(db: Session, a: ApprovalRequest) -> None:
    exam_id = (a.payload or {}).get("exam_id")
    if not exam_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payload.exam_id required to publish a result",
        )
    exam = db.get(Exam, exam_id)
    if not exam or exam.school_id != a.school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam not found for this school",
        )
    if exam.is_published:
        # Idempotent — approving a publish for an already-published exam is fine
        return
    exam.is_published = True
    exam.published_at = datetime.now(timezone.utc)


# ----- Requester guard -----

def can_request(user: User) -> bool:
    """Who's allowed to file an approval request? School admin + teacher
    today (the natural sources of marks/attendance/result changes)."""
    return user.role in (UserRole.school_admin, UserRole.teacher)
