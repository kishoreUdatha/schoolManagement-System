"""The staff home screen, and what the person signed in is allowed to do.

A staff member's dashboard is not fixed by their role — it is assembled from
the jobs they hold. So the same endpoint answers differently for the person
who runs the library and the person who runs the hostel, and the frontend
does not need a list of role-to-screen mappings to keep in step.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.database import get_db
from app.services import rbac_service, role_dashboard_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class Stat(BaseModel):
    label: str
    value: object
    tone: str | None = None


class TrendMonth(BaseModel):
    month: str
    value: int


class Trend(BaseModel):
    """Six months of the one count that shows the job's workload."""
    label: str
    months: list[TrendMonth]


class Panel(BaseModel):
    key: str
    title: str
    href: str | None = None
    stats: list[Stat]
    todo: str | None = None
    trend: Trend | None = None


class StaffDashboard(BaseModel):
    name: str
    role: str
    panels: list[Panel]
    jobs: list[str]
    nothing_assigned: bool


@router.get("/dashboard", response_model=StaffDashboard,
            summary="Panels for the jobs this person holds")
def dashboard(current_user: CurrentUser, db: Db):
    return role_dashboard_service.staff_dashboard(db, current_user)


@router.get("/my-permissions", response_model=list[str],
            summary="What the signed-in person is allowed to do")
def my_permissions(current_user: CurrentUser, db: Db):
    """Used by the front end to decide what to show.

    It is not a security boundary — every endpoint checks for itself. This is
    so a person is not shown a door that will not open for them.
    """
    return sorted(rbac_service.permissions_for(db, current_user))
