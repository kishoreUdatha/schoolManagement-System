from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import SuperAdminUser
from app.core.enums import TenantStatus
from app.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.subscription import SubscriptionRead
from app.schemas.tenant import (
    TenantCreate,
    TenantCreateResponse,
    TenantDetailRead,
    TenantRead,
    TenantStatusUpdate,
    TenantUpdate,
)
from app.services import tenant_service


router = APIRouter()


@router.post(
    "",
    response_model=TenantCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new tenant (school) with first school admin",
)
def create_tenant(
    payload: TenantCreate,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    tenant, school, admin_user, temp_password = tenant_service.create_tenant_with_school_admin(
        db, payload
    )
    return TenantCreateResponse(
        tenant=TenantRead.model_validate(tenant),
        school={
            "id": school.id,
            "tenant_id": school.tenant_id,
            "name": school.name,
            "code": school.code,
            "logo_url": school.logo_url,
            "address": school.address,
            "timezone": school.timezone,
            "currency": school.currency,
            "status": school.status,
            "is_active": school.is_active,
            "created_at": school.created_at,
        },
        school_admin_user_id=admin_user.id,
        school_admin_email=admin_user.email,
        school_admin_temporary_password=temp_password,
    )


@router.get("", response_model=PaginatedResponse[TenantRead], summary="List tenants")
def list_tenants(
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by name, code, or contact email"),
    status_filter: Optional[TenantStatus] = Query(None, alias="status"),
):
    items, total = tenant_service.list_tenants(
        db, page=page, page_size=page_size, search=search, status_filter=status_filter
    )
    return PaginatedResponse.build(
        items=[TenantRead.model_validate(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{tenant_id}",
    response_model=TenantDetailRead,
    summary="Get tenant detail with schools + current subscription",
)
def get_tenant(
    tenant_id: int,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    tenant = tenant_service.get_tenant(db, tenant_id)
    current_sub = tenant_service.get_current_subscription(db, tenant_id)
    detail = TenantDetailRead.model_validate(tenant)
    detail.current_subscription = (
        SubscriptionRead.model_validate(current_sub) if current_sub else None
    )
    return detail


@router.patch("/{tenant_id}", response_model=TenantRead, summary="Update tenant details")
def update_tenant(
    tenant_id: int,
    payload: TenantUpdate,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    tenant = tenant_service.update_tenant(db, tenant_id, payload)
    return TenantRead.model_validate(tenant)


@router.patch(
    "/{tenant_id}/status",
    response_model=TenantRead,
    summary="Activate / suspend / soft-delete a tenant",
)
def set_status(
    tenant_id: int,
    payload: TenantStatusUpdate,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    tenant = tenant_service.set_tenant_status(db, tenant_id, payload.status)
    return TenantRead.model_validate(tenant)
