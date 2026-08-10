"""Alias of /school/dashboard so principal-portal frontends have a clean URL.

Shares the same shape and underlying service.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import PrincipalUser
from app.database import get_db
from app.schemas.dashboard import DashboardRead
from app.services import dashboard_service


router = APIRouter()


@router.get(
    "",
    response_model=DashboardRead,
    summary="School-wide dashboard for the principal",
)
def get_dashboard(
    current_user: PrincipalUser,
    db: Annotated[Session, Depends(get_db)],
):
    data = dashboard_service.build_dashboard(db, current_user.school_id)
    return DashboardRead.model_validate(data)
