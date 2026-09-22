"""Dashboard feeds that no one module owns: today's schedule and the recent
activity list.

Both read only. Today's schedule is open to every member of staff (each sees
their own day, the head and the office see the whole school); the activity
feed is for the admin and the principal, and carries titles, never the
changed values themselves.
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.school.directory import _school_staff
from app.core.deps import SchoolAdminOrPrincipal
from app.database import get_db
from app.models.user import User
from app.services import insight_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(_school_staff)]


class ScheduleItem(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    title: str
    sub: str
    # lesson | break | event | meeting | exam
    kind: str


class TodaySchedule(BaseModel):
    date: date
    # school: the whole timetable (admin, principal); personal: this person's day
    scope: str
    holiday: Optional[str] = None
    items: list[ScheduleItem]


class ActivityItem(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    title: str
    detail: Optional[str] = None
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    created_at: datetime


@router.get("/schedule/today", response_model=TodaySchedule, summary="Today's timetable and calendar, in time order")
def schedule_today(current_user: Staff, db: Db):
    return insight_service.today_schedule(db, current_user)


@router.get("/activity", response_model=list[ActivityItem], summary="Recent activity, from the audit trail")
def activity(current_user: SchoolAdminOrPrincipal, db: Db, limit: int = Query(8, ge=1, le=50)):
    return insight_service.activity_feed(db, school_id=current_user.school_id, limit=limit)
