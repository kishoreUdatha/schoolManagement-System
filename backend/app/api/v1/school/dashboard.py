from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrPrincipal
from app.database import get_db
from app.schemas.dashboard import DashboardRead
from app.services import dashboard_service


router = APIRouter()


@router.get(
    "",
    response_model=DashboardRead,
    summary="Aggregated home dashboard (school admin OR principal)",
)
def get_dashboard(
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
):
    data = dashboard_service.build_dashboard(db, current_user.school_id)
    return DashboardRead.model_validate(data)
