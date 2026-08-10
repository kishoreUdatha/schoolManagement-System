from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import StaffLeaveKind, StaffLeaveStatus


class StaffLeaveCreate(BaseModel):
    kind: StaffLeaveKind = StaffLeaveKind.casual
    from_date: date
    to_date: date
    reason: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _check_range(self):
        if self.to_date < self.from_date:
            raise ValueError("to_date must be on or after from_date")
        return self


class StaffLeaveDecide(BaseModel):
    status: StaffLeaveStatus
    decision_remark: Optional[str] = Field(None, max_length=2000)


class StaffLeaveRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    applicant_user_id: int
    applicant_name: Optional[str] = None
    applicant_role: Optional[str] = None
    kind: StaffLeaveKind
    from_date: date
    to_date: date
    days: int
    reason: Optional[str] = None
    status: StaffLeaveStatus
    decided_by_user_id: Optional[int] = None
    decided_by_name: Optional[str] = None
    decision_remark: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime
