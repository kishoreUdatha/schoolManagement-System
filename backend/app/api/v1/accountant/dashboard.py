"""The accountant's first screen: money in, money owed, money late."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrAccountant
from app.database import get_db
from app.services import role_dashboard_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class MonthAmount(BaseModel):
    month: str
    amount: Decimal


class AccountantDashboard(BaseModel):
    collected_today: Decimal
    receipts_today: int
    collected_this_month: Decimal
    outstanding: Decimal
    overdue: Decimal
    families_owing: int
    by_month: list[MonthAmount]


@router.get("/dashboard", response_model=AccountantDashboard,
            summary="Collections today and this month, against what is owed")
def dashboard(current_user: SchoolAdminOrAccountant, db: Db):
    return role_dashboard_service.accountant_dashboard(db, current_user.school_id)
