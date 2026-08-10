from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.core.enums import FeeReminderKind


class ReminderRunResult(BaseModel):
    school_id: int
    ran_at: datetime
    today: date
    candidates: int
    sent: int
    skipped_already_sent: int
    by_kind: dict[str, int]


class ReminderLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_fee_id: int
    student_name: Optional[str] = None
    student_admission_no: Optional[str] = None
    kind: FeeReminderKind
    send_date: date
    sent_at: datetime
    notice_id: Optional[int] = None
