from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SuperAdminUser
from app.database import get_db
from app.schemas.usage import PlatformUsageSummary, TenantUsageRead
from app.services import usage_service


router = APIRouter()


@router.get(
    "/tenants/{tenant_id}/usage",
    response_model=TenantUsageRead,
    summary="Current usage + quota breakdown for a tenant",
)
def tenant_usage(
    tenant_id: int,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    return usage_service.get_tenant_usage(db, tenant_id)


@router.get(
    "/usage/summary",
    response_model=PlatformUsageSummary,
    summary="Platform-wide rollup across all tenants",
)
def summary(
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    return usage_service.platform_summary(db)


# ---------- Renewals ----------

@router.get(
    "/usage/renewals",
    response_model=list[dict],
    summary="List tenants with subscriptions expiring within N days",
)
def list_renewals(
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
    within_days: int = Query(14, ge=1, le=3650),
):
    return usage_service.list_expiring_subscriptions(db, within_days=within_days)


@router.post(
    "/usage/renewals/send",
    response_model=dict,
    summary="Dispatch renewal reminders to all expiring tenants",
)
def send_renewals(
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
    within_days: int = Query(14, ge=1, le=3650),
):
    return usage_service.send_renewal_reminders(db, within_days=within_days)


# ---------- CSV export ----------

@router.get(
    "/usage/export.csv",
    summary="Export daily usage rows for all tenants as CSV",
)
def export_csv(
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
):
    csv_str = usage_service.export_usage_csv(
        db, from_date=from_date, to_date=to_date
    )
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="tenant-usage.csv"',
        },
    )
