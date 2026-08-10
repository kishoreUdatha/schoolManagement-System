from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import SuperAdminUser
from app.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.plan import PlanCreate, PlanRead, PlanUpdate
from app.services import plan_service


router = APIRouter()


@router.post(
    "",
    response_model=PlanRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a subscription plan",
)
def create_plan(
    payload: PlanCreate,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    plan = plan_service.create_plan(db, payload)
    return PlanRead.model_validate(plan)


@router.get("", response_model=PaginatedResponse[PlanRead], summary="List plans")
def list_plans(
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    active_only: bool = Query(True),
):
    items, total = plan_service.list_plans(
        db, page=page, page_size=page_size, active_only=active_only
    )
    return PaginatedResponse.build(
        items=[PlanRead.model_validate(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{plan_id}", response_model=PlanRead, summary="Get plan detail")
def get_plan(
    plan_id: int,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    return PlanRead.model_validate(plan_service.get_plan(db, plan_id))


@router.patch("/{plan_id}", response_model=PlanRead, summary="Update plan")
def update_plan(
    plan_id: int,
    payload: PlanUpdate,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    return PlanRead.model_validate(plan_service.update_plan(db, plan_id, payload))


@router.delete(
    "/{plan_id}",
    response_model=PlanRead,
    summary="Deactivate plan (soft-delete; existing subscriptions remain valid)",
)
def deactivate_plan(
    plan_id: int,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    return PlanRead.model_validate(plan_service.deactivate_plan(db, plan_id))
