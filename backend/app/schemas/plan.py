from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ModuleKey, PlanTier


class PlanModuleItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    module_key: ModuleKey
    enabled: bool = True


class PlanBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    tier: PlanTier = PlanTier.basic
    description: Optional[str] = Field(None, max_length=500)
    price_monthly: Decimal = Field(default=Decimal("0"), ge=0)
    price_yearly: Decimal = Field(default=Decimal("0"), ge=0)
    student_limit: int = Field(default=0, ge=0)
    staff_limit: int = Field(default=0, ge=0)
    storage_mb_limit: int = Field(default=0, ge=0)
    sms_quota: int = Field(default=0, ge=0)
    whatsapp_quota: int = Field(default=0, ge=0)
    email_quota: int = Field(default=0, ge=0)


class PlanCreate(PlanBase):
    modules: list[PlanModuleItem] = []


class PlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    tier: Optional[PlanTier] = None
    description: Optional[str] = Field(None, max_length=500)
    price_monthly: Optional[Decimal] = Field(None, ge=0)
    price_yearly: Optional[Decimal] = Field(None, ge=0)
    student_limit: Optional[int] = Field(None, ge=0)
    staff_limit: Optional[int] = Field(None, ge=0)
    storage_mb_limit: Optional[int] = Field(None, ge=0)
    sms_quota: Optional[int] = Field(None, ge=0)
    whatsapp_quota: Optional[int] = Field(None, ge=0)
    email_quota: Optional[int] = Field(None, ge=0)
    modules: Optional[list[PlanModuleItem]] = None


class PlanRead(PlanBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool
    created_at: datetime
    modules: list[PlanModuleItem] = []
