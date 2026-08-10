from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.services import result_service


router = APIRouter()


@router.get(
    "/{exam_id}/sections/{section_id}/report-cards.pdf",
    summary="Bulk download report cards for every student in a section",
)
def bulk_section_pdf(
    exam_id: int,
    section_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    pdf_bytes, filename = result_service.section_report_cards(
        db, current_user.school_id, exam_id, section_id
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
