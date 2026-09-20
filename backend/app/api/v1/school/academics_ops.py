"""Subject groups, curricula and co-curricular activities.

Reading is open to the admin and the principal; changing the shape of what a
school teaches is the office's. Activity membership is the exception — a club
register is changed by whoever runs the club, so it follows the same rule as
the rest of the school admin surface rather than inventing a narrower one.
"""
from __future__ import annotations

from datetime import date, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrPrincipal, SchoolAdminUser
from app.core.enums import ActivityKind, CurriculumStatus
from app.database import get_db
from app.services import academics_ops_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class GroupIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: str = Field(..., min_length=1, max_length=20)
    description: Optional[str] = Field(None, max_length=300)
    is_active: bool = True


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=300)
    is_active: Optional[bool] = None


class GroupMemberIn(BaseModel):
    subject_id: int
    is_elective: bool = False


class CurriculumIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    board: Optional[str] = Field(None, max_length=80)
    academic_year_id: int
    class_id: Optional[int] = None
    effective_from: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=4000)


class CurriculumSubjectIn(BaseModel):
    subject_id: int
    periods_per_week: int = Field(0, ge=0, le=40)
    is_core: bool = True


class ActivityIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    kind: ActivityKind = ActivityKind.club
    description: Optional[str] = Field(None, max_length=4000)
    in_charge_user_id: Optional[int] = None
    day_of_week: Optional[int] = Field(None, ge=1, le=7)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    venue: Optional[str] = Field(None, max_length=160)
    capacity: Optional[int] = Field(None, ge=1, le=2000)
    is_active: bool = True


class ActivityUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    kind: Optional[ActivityKind] = None
    description: Optional[str] = Field(None, max_length=4000)
    in_charge_user_id: Optional[int] = None
    day_of_week: Optional[int] = Field(None, ge=1, le=7)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    venue: Optional[str] = Field(None, max_length=160)
    capacity: Optional[int] = Field(None, ge=1, le=2000)
    is_active: Optional[bool] = None


class JoinIn(BaseModel):
    student_id: int
    role: Optional[str] = Field(None, max_length=80)
    joined_on: Optional[date] = None


class LeaveIn(BaseModel):
    student_id: int
    left_on: Optional[date] = None


# ----- subject groups -----


@router.get("/groups", summary="Subject groups and what is in them")
def list_groups(user: SchoolAdminOrPrincipal, db: Db):
    return svc.list_groups(db, user.school_id)


@router.post("/groups", status_code=status.HTTP_201_CREATED, summary="Make a group")
def create_group(payload: GroupIn, user: SchoolAdminUser, db: Db):
    return svc.create_group(db, user.school_id, user.tenant_id, payload.model_dump())


@router.patch("/groups/{group_id}", summary="Rename or retire a group")
def update_group(group_id: int, payload: GroupUpdate, user: SchoolAdminUser, db: Db):
    return svc.update_group(db, user.school_id, group_id,
                            payload.model_dump(exclude_unset=True))


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Remove the grouping; every subject in it is untouched")
def delete_group(group_id: int, user: SchoolAdminUser, db: Db):
    svc.delete_group(db, user.school_id, group_id)


@router.post("/groups/{group_id}/subjects", summary="Put a subject in a group")
def add_to_group(group_id: int, payload: GroupMemberIn, user: SchoolAdminUser, db: Db):
    return svc.add_to_group(db, user.school_id, group_id, payload.subject_id,
                            payload.is_elective)


@router.delete("/groups/{group_id}/subjects/{subject_id}",
               summary="Take a subject out; the subject itself stays")
def remove_from_group(group_id: int, subject_id: int, user: SchoolAdminUser, db: Db):
    return svc.remove_from_group(db, user.school_id, group_id, subject_id)


# ----- curricula -----


@router.get("/curricula", summary="Programmes, by year and status")
def list_curricula(user: SchoolAdminOrPrincipal, db: Db,
                   academic_year_id: Optional[int] = None,
                   state: Optional[CurriculumStatus] = None):
    return svc.list_curricula(db, user.school_id,
                              academic_year_id=academic_year_id, status_filter=state)


@router.post("/curricula", status_code=status.HTTP_201_CREATED,
             summary="Draft a programme")
def create_curriculum(payload: CurriculumIn, user: SchoolAdminUser, db: Db):
    return svc.create_curriculum(db, user.school_id, user.tenant_id,
                                 payload.model_dump())


@router.post("/curricula/{curriculum_id}/activate",
             summary="Put it in force, retiring whatever held that slot")
def activate(curriculum_id: int, user: SchoolAdminUser, db: Db):
    return svc.activate_curriculum(db, user.school_id, curriculum_id)


@router.post("/curricula/{curriculum_id}/retire", summary="Take it out of force")
def retire(curriculum_id: int, user: SchoolAdminUser, db: Db):
    return svc.retire_curriculum(db, user.school_id, curriculum_id)


@router.put("/curricula/{curriculum_id}/subjects",
            summary="Set what a subject is worth in this programme")
def set_curriculum_subject(curriculum_id: int, payload: CurriculumSubjectIn,
                           user: SchoolAdminUser, db: Db):
    return svc.set_curriculum_subject(db, user.school_id, curriculum_id,
                                      payload.subject_id, payload.periods_per_week,
                                      payload.is_core)


@router.delete("/curricula/{curriculum_id}/subjects/{subject_id}",
               summary="Drop a subject from the programme")
def remove_curriculum_subject(curriculum_id: int, subject_id: int,
                              user: SchoolAdminUser, db: Db):
    return svc.remove_curriculum_subject(db, user.school_id, curriculum_id, subject_id)


# ----- activities -----


@router.get("/activities", summary="Clubs, teams and everything outside the timetable")
def list_activities(user: SchoolAdminOrPrincipal, db: Db, active_only: bool = False):
    return svc.list_activities(db, user.school_id, active_only=active_only)


@router.get("/activities/{activity_id}", summary="One activity and its roster")
def get_activity(activity_id: int, user: SchoolAdminOrPrincipal, db: Db):
    return svc.get_activity(db, user.school_id, activity_id)


@router.post("/activities", status_code=status.HTTP_201_CREATED,
             summary="Start an activity")
def create_activity(payload: ActivityIn, user: SchoolAdminUser, db: Db):
    return svc.create_activity(db, user.school_id, user.tenant_id, payload.model_dump())


@router.patch("/activities/{activity_id}", summary="Change one")
def update_activity(activity_id: int, payload: ActivityUpdate,
                    user: SchoolAdminUser, db: Db):
    return svc.update_activity(db, user.school_id, activity_id,
                               payload.model_dump(exclude_unset=True))


@router.post("/activities/{activity_id}/members",
             summary="Add a child, refusing once it is full")
def join(activity_id: int, payload: JoinIn, user: SchoolAdminUser, db: Db):
    return svc.join_activity(db, user.school_id, activity_id, payload.student_id,
                             role=payload.role, joined_on=payload.joined_on)


@router.post("/activities/{activity_id}/members/leave",
             summary="Close a membership; the record of it stays")
def leave(activity_id: int, payload: LeaveIn, user: SchoolAdminUser, db: Db):
    return svc.leave_activity(db, user.school_id, activity_id, payload.student_id,
                              left_on=payload.left_on)


@router.get("/students/{student_id}/activities",
            summary="What one child does outside lessons")
def student_activities(student_id: int, user: SchoolAdminOrPrincipal, db: Db):
    return svc.student_activities(db, user.school_id, student_id)
