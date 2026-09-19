"""Question bank and online tests (admin, principal read-only, subject teachers)."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.enums import BloomLevel, Difficulty, OnlineTestStatus, QuestionKind, UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.online_exam import (
    AttemptResult,
    AutoPickIn,
    GradeIn,
    OrderIn,
    QuestionIn,
    QuestionPage,
    QuestionRead,
    TestDetail,
    TestIn,
    TestQuestionsIn,
    TestRead,
    TestResults,
)
from app.services import online_exam_service as svc


def _academic_staff(current_user: CurrentUser) -> User:
    if current_user.role not in (UserRole.school_admin, UserRole.principal, UserRole.teacher) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teaching staff access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Academic = Annotated[User, Depends(_academic_staff)]


# ---------- question bank ----------


@router.get("/questions", response_model=QuestionPage)
def list_questions(
    current_user: Academic,
    db: Db,
    subject_id: Optional[int] = None,
    class_level: Optional[str] = None,
    chapter_id: Optional[int] = None,
    bloom_level: Optional[BloomLevel] = None,
    difficulty: Optional[Difficulty] = None,
    kind: Optional[QuestionKind] = None,
    search: Optional[str] = None,
    include_inactive: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return svc.list_questions(
        db, current_user, limit=limit, offset=offset, subject_id=subject_id, class_level=class_level,
        chapter_id=chapter_id, bloom_level=bloom_level, difficulty=difficulty, kind=kind, search=search,
        active_only=not include_inactive,
    )


@router.post("/questions", response_model=QuestionRead, status_code=status.HTTP_201_CREATED)
def create_question(payload: QuestionIn, current_user: Academic, db: Db):
    return svc.questions_to_read(db, [svc.create_question(db, current_user, payload)])[0]


@router.get("/questions/{question_id}", response_model=QuestionRead)
def get_question(question_id: int, current_user: Academic, db: Db):
    return svc.questions_to_read(db, [svc.get_question(db, current_user, question_id)])[0]


@router.put("/questions/{question_id}", response_model=QuestionRead)
def update_question(question_id: int, payload: QuestionIn, current_user: Academic, db: Db):
    return svc.questions_to_read(db, [svc.update_question(db, current_user, question_id, payload)])[0]


@router.post("/questions/{question_id}/active", response_model=QuestionRead, summary="Activate / deactivate")
def set_active(question_id: int, current_user: Academic, db: Db, active: bool = True):
    return svc.questions_to_read(db, [svc.set_question_active(db, current_user, question_id, active)])[0]


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(question_id: int, current_user: Academic, db: Db):
    svc.delete_question(db, current_user, question_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- tests ----------


@router.get("/online-tests", response_model=list[TestRead])
def list_tests(current_user: Academic, db: Db, class_subject_id: Optional[int] = None,
               status_: Optional[OnlineTestStatus] = Query(None, alias="status")):
    return svc.list_tests(db, current_user, class_subject_id, status_)


@router.post("/online-tests", response_model=TestDetail, status_code=status.HTTP_201_CREATED)
def create_test(payload: TestIn, current_user: Academic, db: Db):
    t = svc.create_test(db, current_user, payload)
    return svc.test_detail(db, current_user, t.id)


@router.get("/online-tests/{test_id}", response_model=TestDetail)
def get_test(test_id: int, current_user: Academic, db: Db):
    return svc.test_detail(db, current_user, test_id)


@router.put("/online-tests/{test_id}", response_model=TestDetail)
def update_test(test_id: int, payload: TestIn, current_user: Academic, db: Db):
    svc.update_test(db, current_user, test_id, payload)
    return svc.test_detail(db, current_user, test_id)


@router.delete("/online-tests/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test(test_id: int, current_user: Academic, db: Db):
    svc.delete_test(db, current_user, test_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/online-tests/{test_id}/questions", response_model=TestDetail)
def add_questions(test_id: int, payload: TestQuestionsIn, current_user: Academic, db: Db):
    svc.add_questions(db, current_user, test_id, payload.question_ids, payload.marks)
    return svc.test_detail(db, current_user, test_id)


@router.post("/online-tests/{test_id}/auto-pick", response_model=TestDetail, summary="Pick questions by Bloom level / difficulty")
def auto_pick(test_id: int, payload: AutoPickIn, current_user: Academic, db: Db):
    svc.auto_pick(db, current_user, test_id, payload)
    return svc.test_detail(db, current_user, test_id)


@router.delete("/online-tests/{test_id}/questions/{question_id}", response_model=TestDetail)
def remove_question(test_id: int, question_id: int, current_user: Academic, db: Db):
    svc.remove_question(db, current_user, test_id, question_id)
    return svc.test_detail(db, current_user, test_id)


@router.put("/online-tests/{test_id}/question-order", response_model=TestDetail)
def reorder(test_id: int, payload: OrderIn, current_user: Academic, db: Db):
    svc.reorder(db, current_user, test_id, payload.question_ids)
    return svc.test_detail(db, current_user, test_id)


@router.post("/online-tests/{test_id}/publish", response_model=TestDetail)
def publish(test_id: int, current_user: Academic, db: Db):
    svc.publish(db, current_user, test_id)
    return svc.test_detail(db, current_user, test_id)


@router.post("/online-tests/{test_id}/close", response_model=TestDetail, summary="Close now; in-progress attempts are submitted")
def close(test_id: int, current_user: Academic, db: Db):
    svc.close(db, current_user, test_id)
    return svc.test_detail(db, current_user, test_id)


@router.get("/online-tests/{test_id}/results", response_model=TestResults)
def results(test_id: int, current_user: Academic, db: Db):
    return svc.results(db, current_user, test_id)


@router.get("/test-attempts/{attempt_id}", response_model=AttemptResult)
def attempt(attempt_id: int, current_user: Academic, db: Db):
    return svc.staff_attempt(db, current_user, attempt_id)


@router.put("/test-attempts/{attempt_id}/answers/{question_id}/grade", response_model=AttemptResult,
            summary="Mark a short answer")
def grade(attempt_id: int, question_id: int, payload: GradeIn, current_user: Academic, db: Db):
    return svc.grade_answer(db, current_user, attempt_id, question_id, payload)
