"""Every school's payment and WhatsApp connection, for the platform team."""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import SuperAdminUser
from app.database import get_db
from app.services import whatsapp_service

router = APIRouter()


@router.get("/integrations", summary="Payments and WhatsApp, school by school")
def integrations(_: SuperAdminUser, db: Annotated[Session, Depends(get_db)]):
    return whatsapp_service.platform_overview(db)
