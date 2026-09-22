"""Generating timetables, and seeing all of them at once."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrPrincipal, SchoolAdminUser
from app.database import get_db
from app.services import timetable_gen_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class GenerateIn(BaseModel):
    replace: bool = False
    # A seed makes a run repeatable, which matters when somebody asks why a
    # lesson moved between two attempts.
    seed: Optional[int] = None
    # Most periods in a row a teacher may be given (counting their lessons in
    # every section); None = no limit.
    max_consecutive: Optional[int] = Field(None, ge=1, le=12)
    # "none" leaves the room empty (the class stays in its own room), "home"
    # puts lessons in the section's home room, or a room's id as a string.
    room_preference: Optional[str] = Field(None, max_length=20)


class PeriodsIn(BaseModel):
    periods_per_week: int = Field(..., ge=0, le=40)


@router.get("/dashboard", summary="How complete every timetable is")
def dashboard(user: SchoolAdminOrPrincipal, db: Db):
    return svc.dashboard(db, user.school_id)


@router.get("/coordinator", summary="One day across every section")
def coordinator(user: SchoolAdminOrPrincipal, db: Db,
                day_of_week: int = Query(..., ge=1, le=7)):
    return svc.coordinator_view(db, user.school_id, day_of_week)


@router.get("/sections/{section_id}/requirements",
            summary="What each subject wants against what is placed")
def requirements(section_id: int, user: SchoolAdminOrPrincipal, db: Db):
    return svc.requirements(db, user.school_id, section_id)


@router.post("/sections/{section_id}/generate",
             summary="Fill the week in, and say what could not be placed")
def generate(section_id: int, payload: GenerateIn, user: SchoolAdminUser, db: Db):
    return svc.generate(db, user.school_id, section_id,
                        replace=payload.replace, seed=payload.seed,
                        max_consecutive=payload.max_consecutive,
                        room_preference=payload.room_preference)


@router.put("/class-subjects/{class_subject_id}/periods",
            summary="How many periods a week a subject needs")
def set_periods(class_subject_id: int, payload: PeriodsIn,
                user: SchoolAdminUser, db: Db):
    return svc.set_periods_per_week(db, user.school_id, class_subject_id,
                                    payload.periods_per_week)
