"""Syllabus, coverage and lesson plans. Shared by the school admin, principal
and teacher portals; the service decides what each may see and change."""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.enums import LessonPlanStatus, UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.syllabus import (
    ChapterIn,
    ClassSubjectSummary,
    CopyIn,
    CoverageIn,
    DeliverIn,
    LessonPlanIn,
    LessonPlanRead,
    OrderIn,
    ReviewIn,
    SyllabusDetail,
    TopicsIn,
    TopicUpdate,
)
from app.services import syllabus_service as svc


def _academic_staff(current_user: CurrentUser) -> User:
    if current_user.role not in (UserRole.school_admin, UserRole.principal, UserRole.teacher) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teaching staff access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Academic = Annotated[User, Depends(_academic_staff)]


# ---------- syllabus ----------


@router.get("/syllabus", response_model=list[ClassSubjectSummary], summary="Class-subjects with syllabus progress")
def list_syllabi(current_user: Academic, db: Db, academic_year_id: Optional[int] = None):
    return svc.list_class_subjects(db, current_user, academic_year_id)


@router.get("/syllabus/{cs_id}", response_model=SyllabusDetail)
def get_syllabus(cs_id: int, current_user: Academic, db: Db):
    return svc.detail(db, current_user, svc.get_cs(db, cs_id, current_user.school_id))


@router.get("/syllabus/{cs_id}/copy-sources", summary="Other classes with this subject's syllabus")
def copy_sources(cs_id: int, current_user: Academic, db: Db):
    cs = svc.get_cs(db, cs_id, current_user.school_id)
    svc.check_view(db, current_user, cs)
    return svc.copy_sources(db, cs)


@router.post("/syllabus/{cs_id}/copy", response_model=SyllabusDetail)
def copy(cs_id: int, payload: CopyIn, current_user: Academic, db: Db):
    cs = svc.get_cs(db, cs_id, current_user.school_id)
    svc.copy_from(db, current_user, cs, payload.source_class_subject_id)
    return svc.detail(db, current_user, cs)


@router.post("/syllabus/{cs_id}/chapters", response_model=SyllabusDetail, status_code=status.HTTP_201_CREATED)
def add_chapter(cs_id: int, payload: ChapterIn, current_user: Academic, db: Db):
    cs = svc.get_cs(db, cs_id, current_user.school_id)
    svc.add_chapter(db, current_user, cs, payload)
    return svc.detail(db, current_user, cs)


@router.put("/syllabus/{cs_id}/chapter-order", response_model=SyllabusDetail)
def order_chapters(cs_id: int, payload: OrderIn, current_user: Academic, db: Db):
    cs = svc.get_cs(db, cs_id, current_user.school_id)
    svc.reorder_chapters(db, current_user, cs, payload.ids)
    return svc.detail(db, current_user, cs)


@router.put("/syllabus/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_chapter(chapter_id: int, payload: ChapterIn, current_user: Academic, db: Db):
    svc.update_chapter(db, current_user, chapter_id, payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/syllabus/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter(chapter_id: int, current_user: Academic, db: Db):
    svc.delete_chapter(db, current_user, chapter_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/syllabus/chapters/{chapter_id}/topics", status_code=status.HTTP_204_NO_CONTENT)
def add_topics(chapter_id: int, payload: TopicsIn, current_user: Academic, db: Db):
    svc.add_topics(db, current_user, chapter_id, payload.titles)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/syllabus/chapters/{chapter_id}/topic-order", status_code=status.HTTP_204_NO_CONTENT)
def order_topics(chapter_id: int, payload: OrderIn, current_user: Academic, db: Db):
    svc.reorder_topics(db, current_user, chapter_id, payload.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/syllabus/topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_topic(topic_id: int, payload: TopicUpdate, current_user: Academic, db: Db):
    svc.update_topic(db, current_user, topic_id, payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/syllabus/topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_topic(topic_id: int, current_user: Academic, db: Db):
    svc.delete_topic(db, current_user, topic_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/syllabus/topics/{topic_id}/coverage", status_code=status.HTTP_204_NO_CONTENT, summary="Mark taught / not taught in a section")
def coverage(topic_id: int, payload: CoverageIn, current_user: Academic, db: Db):
    svc.set_coverage(db, current_user, topic_id, payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- lesson plans ----------


def _one(db: Session, p) -> dict:
    return svc.plans_to_read(db, [p])[0]


@router.get("/lesson-plans", response_model=list[LessonPlanRead])
def list_plans(
    current_user: Academic,
    db: Db,
    status_: Optional[LessonPlanStatus] = Query(None, alias="status"),
    teacher_user_id: Optional[int] = None,
    class_subject_id: Optional[int] = None,
    start: Optional[date] = None,
    end: Optional[date] = None,
):
    plans = svc.list_plans(db, current_user, status_=status_, teacher_user_id=teacher_user_id,
                           class_subject_id=class_subject_id, start=start, end=end)
    return svc.plans_to_read(db, plans)


@router.post("/lesson-plans", response_model=LessonPlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(payload: LessonPlanIn, current_user: Academic, db: Db):
    return _one(db, svc.create_plan(db, current_user, payload))


@router.put("/lesson-plans/{plan_id}", response_model=LessonPlanRead)
def update_plan(plan_id: int, payload: LessonPlanIn, current_user: Academic, db: Db):
    return _one(db, svc.update_plan(db, current_user, plan_id, payload))


@router.delete("/lesson-plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: int, current_user: Academic, db: Db):
    svc.delete_plan(db, current_user, plan_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/lesson-plans/{plan_id}/submit", response_model=LessonPlanRead)
def submit_plan(plan_id: int, current_user: Academic, db: Db):
    return _one(db, svc.submit_plan(db, current_user, plan_id))


@router.post("/lesson-plans/{plan_id}/review", response_model=LessonPlanRead)
def review_plan(plan_id: int, payload: ReviewIn, current_user: Academic, db: Db):
    return _one(db, svc.review_plan(db, current_user, plan_id, payload))


@router.post("/lesson-plans/{plan_id}/deliver", response_model=LessonPlanRead, summary="Record the lesson as taught")
def deliver_plan(plan_id: int, payload: DeliverIn, current_user: Academic, db: Db):
    return _one(db, svc.deliver_plan(db, current_user, plan_id, payload))
