"""Children take online tests through the parent portal."""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.online_exam import AnswersIn, AttemptResult, ChildTest, Paper
from app.services import online_exam_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/children/{student_id}/tests", response_model=list[ChildTest])
def tests(student_id: int, current_user: ParentUser, db: Db):
    return svc.child_tests(db, current_user.id, student_id)


@router.post("/children/{student_id}/tests/{test_id}/start", response_model=Paper, summary="Start (or resume) the test")
def start(student_id: int, test_id: int, current_user: ParentUser, db: Db):
    return svc.start(db, current_user.id, student_id, test_id)


@router.get("/test-attempts/{attempt_id}", response_model=Paper)
def paper(attempt_id: int, current_user: ParentUser, db: Db):
    return svc.paper(db, current_user.id, attempt_id)


@router.put("/test-attempts/{attempt_id}/answers", response_model=Paper, summary="Save answers (autosave)")
def save(attempt_id: int, payload: AnswersIn, current_user: ParentUser, db: Db):
    return svc.save_answers(db, current_user.id, attempt_id, payload.answers)


@router.post("/test-attempts/{attempt_id}/submit", response_model=AttemptResult)
def submit(attempt_id: int, current_user: ParentUser, db: Db):
    return svc.submit(db, current_user.id, attempt_id)


@router.get("/test-attempts/{attempt_id}/result", response_model=AttemptResult)
def result(attempt_id: int, current_user: ParentUser, db: Db):
    return svc.child_result(db, current_user.id, attempt_id)
