from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Channel = Literal["whatsapp", "sms"]


class ChannelIn(BaseModel):
    provider: Literal["meta", "twilio", "msg91", "mock"]
    sender: str = Field(..., min_length=2, max_length=40)
    account_id: Optional[str] = Field(None, max_length=64)
    # Secret: sent to set or change it, left out to keep what is stored.
    token: Optional[str] = Field(None, max_length=1000)
    template: Optional[str] = Field(None, max_length=120)
    language: str = Field("en", min_length=2, max_length=10)
    default_country_code: str = Field("91", pattern=r"^\d{1,4}$")
    is_enabled: bool = True


class ChannelRead(BaseModel):
    channel: Channel
    configured: bool
    provider: Optional[str] = None
    sender: Optional[str] = None
    account_id: Optional[str] = None
    has_token: bool = False
    template: Optional[str] = None
    language: str = "en"
    default_country_code: str = "91"
    is_enabled: bool = False
    last_error: Optional[str] = None


class MessagingRead(BaseModel):
    whatsapp: ChannelRead
    sms: ChannelRead
    mock_available: bool
    web_app_url: str
    sample: str  # the message as a new school admin would get it


class TestIn(BaseModel):
    to: str = Field(..., min_length=6, max_length=20)


class SendResult(BaseModel):
    channel: str
    to: str
    status: str  # "sent", "failed", "skipped"
    error: Optional[str] = None


class LoginSendResult(BaseModel):
    email: str
    temporary_password: Optional[str] = None
    sent: list[SendResult]


class MessageLogRead(BaseModel):
    id: int
    tenant_id: Optional[int] = None
    tenant_name: Optional[str] = None
    purpose: str
    channel: str
    to_number: str
    status: str
    error: Optional[str] = None
    created_at: datetime
