from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ApprovalKind, ApprovalStatus


class ApprovalCreate(BaseModel):
    kind: ApprovalKind
    reason: Optional[str] = Field(None, max_length=2000)
    payload: dict = Field(default_factory=dict)


class ApprovalDecide(BaseModel):
    """Principal's decision. status must be approved or rejected."""

    status: ApprovalStatus
    decision_remark: Optional[str] = Field(None, max_length=2000)


class ApprovalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: ApprovalKind
    status: ApprovalStatus
    requested_by_user_id: Optional[int] = None
    requested_by_name: Optional[str] = None
    reason: Optional[str] = None
    payload: dict
    reviewed_by_user_id: Optional[int] = None
    reviewed_by_name: Optional[str] = None
    decision_remark: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime
