from typing import Optional

from pydantic import BaseModel


class QuotaSlice(BaseModel):
    used: int
    limit: int
    percent: float


class TenantUsageRead(BaseModel):
    tenant_id: int
    students: QuotaSlice
    staff: QuotaSlice
    parents: int
    active_users: int
    storage_mb: QuotaSlice
    sms_sent: QuotaSlice
    whatsapp_sent: QuotaSlice
    email_sent: QuotaSlice
    payment_status: Optional[str] = None
    subscription_expires_at: Optional[str] = None


class PlatformUsageSummary(BaseModel):
    total_tenants: int
    active_tenants: int
    suspended_tenants: int
    total_schools: int
    total_students: int
    total_staff: int
    total_parents: int
    sms_sent_30d: int
    whatsapp_sent_30d: int
    email_sent_30d: int
    storage_used_mb: int
    revenue_30d: float
    pending_renewals: int
