from typing import Optional

from pydantic import BaseModel


class SettingsRow(BaseModel):
    """One settings area, and where to read or change it."""

    key: str
    module: str
    name: str
    description: str
    read: str
    write: Optional[str] = None
    configured: bool


class IntegrationRow(BaseModel):
    key: str
    name: str
    purpose: str
    read: Optional[str] = None
    write: Optional[str] = None
    enabled: bool
    configured: bool
    detail: Optional[str] = None
