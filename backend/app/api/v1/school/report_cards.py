from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.enums import UserRole
from app.database import get_db
from app.models.academic import Section
from app.models.user import User
from app.services import result_service


router = APIRouter()


def _may_print(current_user: CurrentUser) -> User:
    if current_user.role not in (UserRole.school_admin, UserRole.principal, UserRole.teacher) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teaching staff access required")
    return current_user


@router.get(
    "/{exam_id}/sections/{section_id}/report-cards.pdf",
    summary="Bulk download report cards for every student in a section",
)
def bulk_section_pdf(
    exam_id: int,
    section_id: int,
    current_user: Annotated[User, Depends(_may_print)],
    db: Annotated[Session, Depends(get_db)],
):
    if current_user.role == UserRole.teacher:
        sec = db.get(Section, section_id)
        if not sec or sec.class_teacher_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the class teacher of this section can print its report cards",
            )
    pdf_bytes, filename = result_service.section_report_cards(
        db, current_user.school_id, exam_id, section_id
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
