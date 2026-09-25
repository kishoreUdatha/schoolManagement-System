from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.ai import client as ai_client, drafting
from app.core.deps import TeacherUser
from app.core.enums import BehaviourPeriodKind
from app.database import get_db
from app.schemas.behaviour import (
    AISuggestRequest,
    AISuggestResponse,
    BehaviourRatingRead,
    BehaviourRatingSave,
    SectionViewRead,
)
from app.services import behaviour_service


router = APIRouter()


@router.post(
    "",
    response_model=BehaviourRatingRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create or update a behaviour rating for a student",
)
def save(
    payload: BehaviourRatingSave,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    rec = behaviour_service.save(
        db,
        current_user.tenant_id,
        current_user.school_id,
        current_user.id,
        payload.student_id,
        payload.period_kind,
        payload.period_key,
        payload.punctuality,
        payload.participation,
        payload.discipline,
        payload.respect,
        payload.teacher_note,
    )
    return BehaviourRatingRead.model_validate(behaviour_service._to_read_dict(db, rec))


@router.get(
    "/student/{student_id}",
    response_model=list[BehaviourRatingRead],
    summary="History of ratings for one student (newest first)",
)
def list_for_student(
    student_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = behaviour_service.list_for_student(db, student_id, current_user.school_id)
    return [
        BehaviourRatingRead.model_validate(behaviour_service._to_read_dict(db, r))
        for r in items
    ]


@router.get(
    "/section/{section_id}",
    response_model=SectionViewRead,
    summary="Roster with existing ratings for a section + period",
)
def section_view(
    section_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    period_kind: BehaviourPeriodKind = Query(BehaviourPeriodKind.weekly),
    period_key: Optional[str] = Query(None),
):
    data = behaviour_service.section_view(
        db,
        current_user.id,
        current_user.school_id,
        section_id,
        period_kind,
        period_key,
    )
    return SectionViewRead.model_validate(data)


@router.post(
    "/ai-suggest",
    response_model=AISuggestResponse,
    summary="AI-suggested ratings from a teacher's note (Claude; word-count heuristic without an API key)",
)
def ai_suggest(
    payload: AISuggestRequest,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    # Validate teacher has access to this student
    behaviour_service._check_class_teacher_for_student(
        db, current_user.id, payload.student_id, current_user.school_id
    )
    if ai_client.enabled():
        try:
            return AISuggestResponse.model_validate(drafting.suggest_behaviour(payload.note))
        except ai_client.AIUnavailable:
            pass  # fall back to the heuristic below
    suggestion = behaviour_service.ai_suggest_stub(payload.note)
    return AISuggestResponse.model_validate(suggestion)
