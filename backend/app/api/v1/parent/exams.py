from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.result import ExamResultRead, ExamSummaryForList
from app.services import result_service


router = APIRouter()


@router.get(
    "/{student_id}/exams",
    response_model=list[ExamSummaryForList],
    summary="Published exams for a linked child, with summary",
)
def list_for_child(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = result_service.list_exams_for_child(
        db, current_user.id, student_id
    )
    return [ExamSummaryForList.model_validate(i) for i in items]


@router.get(
    "/{student_id}/exams/{exam_id}",
    response_model=ExamResultRead,
    summary="Detailed exam result for a linked child",
)
def get_for_child(
    student_id: int,
    exam_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    data = result_service.get_child_exam_result(
        db, current_user.id, student_id, exam_id
    )
    return ExamResultRead.model_validate(data)


@router.get(
    "/{student_id}/exams/{exam_id}/report-card.pdf",
    summary="Download report card PDF for a linked child",
)
def report_card_pdf(
    student_id: int,
    exam_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    result = result_service.get_child_exam_result(
        db, current_user.id, student_id, exam_id
    )
    pdf_bytes = result_service.generate_report_card_pdf(
        db, [result], current_user.school_id
    )
    filename = f"report-card-{result['student_admission_no']}-{result['exam_name'].replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
