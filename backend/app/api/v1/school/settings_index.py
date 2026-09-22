"""Where every setting lives, and which outside services the school is wired to.

Settings are kept with the module they belong to — the library's loan rules sit
with the library, payroll's PF rates with payroll. That is right for editing but
poor for finding, so this lists them in one place with the endpoint that reads
and writes each, and says whether the school has actually set it up yet.
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.models.grading import ReportCardSetting
from app.models.library import LibrarySettings
from app.models.payroll import PayrollSettings
from app.models.tenant import School
from app.schemas.settings_index import IntegrationRow, SettingsRow
from app.services import online_payment_service

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


def _configured(db: Session, model, school_id: int) -> bool:
    return db.execute(
        select(model.id).where(model.school_id == school_id).limit(1)
    ).first() is not None


@router.get("/settings", response_model=list[SettingsRow], summary="Every settings area in one list")
def settings(current_user: SchoolAdminUser, db: Db):
    school = db.get(School, current_user.school_id)
    grading = _configured(db, ReportCardSetting, current_user.school_id)
    return [
        {
            "key": "school_profile",
            "module": "School",
            "name": "School profile",
            "description": "Name, address, logo and the contact details on every letter",
            "read": "GET /school/profile",
            "write": "PATCH /school/profile",
            "configured": bool(school and school.address),
        },
        {
            "key": "report_cards",
            "module": "Exams",
            "name": "Report cards",
            "description": "What a report card shows: attendance, rank, remarks",
            "read": "GET /school/report-card-settings",
            "write": "PUT /school/report-card-settings",
            "configured": grading,
        },
        {
            "key": "library",
            "module": "Library",
            "name": "Library rules",
            "description": "Loan length, renewals, fine per day and the head fines are billed to",
            "read": "GET /school/library/settings",
            "write": "PATCH /school/library/settings",
            "configured": _configured(db, LibrarySettings, current_user.school_id),
        },
        {
            "key": "payroll",
            "module": "HR & Payroll",
            "name": "Payroll rules",
            "description": "PF, ESI and professional tax, and how a month's pay is worked out",
            "read": "GET /school/payroll/settings",
            "write": "PATCH /school/payroll/settings",
            "configured": _configured(db, PayrollSettings, current_user.school_id),
        },
        {
            "key": "roles",
            "module": "Access",
            "name": "Roles and permissions",
            "description": "Who may do what, beyond the built-in roles",
            "read": "GET /school/roles",
            "write": "POST /school/roles",
            "configured": True,
        },
        {
            "key": "branches",
            "module": "Access",
            "name": "Branches",
            "description": "Campuses or blocks a room or staff member belongs to",
            "read": "GET /school/branches",
            "write": "POST /school/branches",
            "configured": True,
        },
    ]


@router.get("/integrations", response_model=list[IntegrationRow],
            summary="Outside services the school is wired to")
def integrations(current_user: SchoolAdminUser, db: Db):
    gateway = online_payment_service.get_gateway(db, current_user.school_id)
    from app.services import whatsapp_service

    wa = whatsapp_service.get_config(db, current_user.school_id)
    gateway_read = online_payment_service.gateway_to_read(current_user.school_id, gateway) if gateway else None
    return [
        {
            "key": "razorpay",
            "name": "Razorpay",
            "purpose": "Parents paying fees online",
            "read": "GET /school/payments/gateway",
            "write": "PUT /school/payments/gateway",
            "enabled": bool(gateway_read and gateway_read.get("is_enabled")),
            "configured": gateway is not None,
            "detail": (gateway_read or {}).get("mode") and f"{gateway_read['mode']} mode",
        },
        {
            "key": "storage",
            "name": "File storage",
            "purpose": "Documents, photos and exports the school uploads",
            "read": "GET /school/documents",
            "write": None,
            "enabled": True,
            "configured": True,
            "detail": "Local disk on the server",
        },
        {
            "key": "whatsapp",
            "name": "WhatsApp",
            "purpose": "Notices, alerts and sign-in codes on the school's own WhatsApp number",
            "read": "GET /school/whatsapp",
            "write": "PUT /school/whatsapp",
            "enabled": bool(wa and whatsapp_service.live_config(db, current_user.school_id)),
            "configured": wa is not None,
            "detail": (f"{wa.sender_number} · {wa.provider}" if wa else "Not connected"),
        },
        {
            "key": "notifications",
            "name": "SMS and email",
            "purpose": "Sending notices outside the app",
            "read": "GET /school/notices",
            "write": None,
            "enabled": False,
            "configured": False,
            "detail": "No SMS or email provider is connected yet",
        },
    ]
