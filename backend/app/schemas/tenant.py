from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import SchoolStatus, TenantStatus


class SchoolBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    code: Optional[str] = Field(None, max_length=40)
    logo_url: Optional[str] = None
    address: Optional[str] = None
    timezone: str = Field(default="Asia/Kolkata", max_length=60)
    currency: str = Field(default="INR", max_length=8)


class SchoolRead(SchoolBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    code: str
    status: SchoolStatus
    is_active: bool
    created_at: datetime


class TenantCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    code: Optional[str] = Field(None, max_length=40, description="Auto-generated if omitted")
    logo_url: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = Field(None, max_length=120)
    contact_email: str = Field(..., max_length=255)
    contact_mobile: str = Field(..., max_length=20)

    school_admin_name: str = Field(..., min_length=2, max_length=160)
    school_admin_email: str = Field(..., max_length=255)
    school_admin_phone: Optional[str] = Field(None, max_length=20)
    school_admin_password: Optional[str] = Field(
        None,
        min_length=8,
        max_length=72,
        description="Auto-generated if omitted; returned once in the response",
    )


class TenantUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    logo_url: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = Field(None, max_length=120)
    contact_email: Optional[str] = Field(None, max_length=255)
    contact_mobile: Optional[str] = Field(None, max_length=20)


class TenantStatusUpdate(BaseModel):
    status: TenantStatus


class TenantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    code: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: str
    contact_mobile: str
    status: TenantStatus
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TenantDetailRead(TenantRead):
    schools: list[SchoolRead] = []
    current_subscription: Optional["SubscriptionRead"] = None


class TenantCreateResponse(BaseModel):
    tenant: TenantRead
    school: SchoolRead
    school_admin_user_id: int
    school_admin_email: str
    school_admin_temporary_password: Optional[str] = Field(
        None, description="Only returned when password was auto-generated"
    )


# Forward ref import to avoid circular at module load
from app.schemas.subscription import SubscriptionRead  # noqa: E402

TenantDetailRead.model_rebuild()
