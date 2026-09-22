from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Provider = Literal["meta", "twilio", "mock"]
Purpose = Literal["attendance", "fees", "exams", "homework", "events", "general", "otp"]


class WhatsappConfigIn(BaseModel):
    provider: Provider
    sender_number: str = Field(..., min_length=6, max_length=20)
    phone_number_id: Optional[str] = Field(None, max_length=64)
    business_account_id: Optional[str] = Field(None, max_length=64)
    account_sid: Optional[str] = Field(None, max_length=64)
    # Secrets: sent to set or change them, left out to keep what is stored.
    token: Optional[str] = Field(None, max_length=1000)
    app_secret: Optional[str] = Field(None, max_length=200)
    default_country_code: str = Field("91", pattern=r"^\d{1,4}$")
    auto_categories: list[Literal["attendance", "fees", "exams", "homework", "events", "general"]] = []
    is_enabled: bool = True


class WhatsappConfigRead(BaseModel):
    configured: bool
    provider: Optional[str] = None
    sender_number: Optional[str] = None
    phone_number_id: Optional[str] = None
    business_account_id: Optional[str] = None
    account_sid: Optional[str] = None
    has_token: bool = False
    has_app_secret: bool = False
    verify_token: Optional[str] = None
    default_country_code: str = "91"
    auto_categories: list[str] = []
    is_enabled: bool = False
    last_error: Optional[str] = None
    webhook_url_path: str
    mock_available: bool = False
    status_callbacks: bool = False  # whether delivery reports can reach us


class TemplateIn(BaseModel):
    purpose: Purpose
    template_name: str = Field(..., min_length=1, max_length=120)
    language: str = Field("en", min_length=2, max_length=10)


class TemplateRead(TemplateIn):
    id: int


class TestIn(BaseModel):
    to: str = Field(..., min_length=6, max_length=20)
    purpose: Purpose = "general"


class TestResult(BaseModel):
    ok: bool
    to: str
    provider_message_id: Optional[str] = None
    detail: str


class DeliveryRow(BaseModel):
    id: int
    notice_id: int
    notice_title: str
    category: str
    recipient_name: Optional[str]
    to_phone: Optional[str]
    status: str
    error: Optional[str]
    sent_at: Optional[datetime]
    read_at: Optional[datetime]
    created_at: datetime


class DeliverySummary(BaseModel):
    last_30_days: dict[str, int]
    rows: list[DeliveryRow]
