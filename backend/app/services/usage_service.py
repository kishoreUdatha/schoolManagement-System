from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.enums import (
    PaymentStatus,
    SubscriptionStatus,
    TenantStatus,
    UserRole,
)
from app.models.student import Student
from app.models.subscription import SubscriptionPayment, TenantSubscription
from app.models.tenant import School, Tenant
from app.models.usage import TenantUsage
from app.models.user import User
from app.schemas.usage import PlatformUsageSummary, QuotaSlice, TenantUsageRead
from app.services.subscription_service import get_current_subscription


_CHANNEL_COLUMN = {
    "sms": "sms_sent",
    "whatsapp": "whatsapp_sent",
    "email": "email_sent",
}


def increment_usage_counter(
    db: Session, tenant_id: int, channel: str, n: int = 1
) -> None:
    """Bump today's counter for a tenant + channel. UPSERT on (tenant_id, metric_date).

    Called by notice_service.send() per successfully-dispatched recipient row.
    Channels not in _CHANNEL_COLUMN (e.g. in_app) are skipped — they don't count
    against plan quota.
    """
    column = _CHANNEL_COLUMN.get(channel)
    if not column:
        return

    today = date.today()
    base_values = {
        "tenant_id": tenant_id,
        "metric_date": today,
        "sms_sent": 0,
        "whatsapp_sent": 0,
        "email_sent": 0,
        "students_count": 0,
        "staff_count": 0,
        "parents_count": 0,
        "active_users_count": 0,
        "storage_used_mb": 0,
    }
    base_values[column] = n

    stmt = (
        pg_insert(TenantUsage.__table__)
        .values(**base_values)
        .on_conflict_do_update(
            constraint="uq_tenant_usage_date",
            set_={column: TenantUsage.__table__.c[column] + n},
        )
    )
    db.execute(stmt)


def _slice(used: int, limit: int) -> QuotaSlice:
    pct = (used / limit * 100) if limit > 0 else 0.0
    return QuotaSlice(used=used, limit=limit, percent=round(pct, 2))


def _count_users_by_role(db: Session, tenant_id: int, role: UserRole) -> int:
    return db.execute(
        select(func.count(User.id)).where(
            User.tenant_id == tenant_id,
            User.role == role,
            User.is_active.is_(True),
        )
    ).scalar_one()


def get_tenant_usage(db: Session, tenant_id: int) -> TenantUsageRead:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    subscription = get_current_subscription(db, tenant_id)
    plan_limits = {
        "student_limit": 0,
        "staff_limit": 0,
        "storage_mb_limit": 0,
        "sms_quota": 0,
        "whatsapp_quota": 0,
        "email_quota": 0,
    }
    if subscription and subscription.plan_id:
        plan = subscription.plan_id
        from app.models.plan import Plan
        plan_obj = db.get(Plan, plan)
        if plan_obj:
            plan_limits = {
                "student_limit": plan_obj.student_limit,
                "staff_limit": plan_obj.staff_limit,
                "storage_mb_limit": plan_obj.storage_mb_limit,
                "sms_quota": plan_obj.sms_quota,
                "whatsapp_quota": plan_obj.whatsapp_quota,
                "email_quota": plan_obj.email_quota,
            }

    # Live counts: students from the dedicated students table, others from users
    students = db.execute(
        select(func.count(Student.id)).where(
            Student.tenant_id == tenant_id, Student.is_active.is_(True)
        )
    ).scalar_one()
    staff = _count_users_by_role(db, tenant_id, UserRole.staff)
    parents = _count_users_by_role(db, tenant_id, UserRole.parent)
    active_users = db.execute(
        select(func.count(User.id)).where(
            User.tenant_id == tenant_id, User.is_active.is_(True)
        )
    ).scalar_one()

    # Last 30 days of dispatch counters and storage from tenant_usage rollup
    today = date.today()
    window_start = today - timedelta(days=30)
    rollup = db.execute(
        select(
            func.coalesce(func.sum(TenantUsage.sms_sent), 0),
            func.coalesce(func.sum(TenantUsage.whatsapp_sent), 0),
            func.coalesce(func.sum(TenantUsage.email_sent), 0),
            func.coalesce(func.max(TenantUsage.storage_used_mb), 0),
        ).where(TenantUsage.tenant_id == tenant_id, TenantUsage.metric_date >= window_start)
    ).one()
    sms_used, wa_used, email_used, storage_used = rollup

    # Last payment status
    last_payment = db.execute(
        select(SubscriptionPayment)
        .where(SubscriptionPayment.tenant_id == tenant_id)
        .order_by(SubscriptionPayment.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    payment_status = last_payment.status.value if last_payment else None
    expires_at = subscription.expires_at.isoformat() if subscription and subscription.expires_at else None

    return TenantUsageRead(
        tenant_id=tenant_id,
        students=_slice(students, plan_limits["student_limit"]),
        staff=_slice(staff, plan_limits["staff_limit"]),
        parents=parents,
        active_users=active_users,
        storage_mb=_slice(int(storage_used), plan_limits["storage_mb_limit"]),
        sms_sent=_slice(int(sms_used), plan_limits["sms_quota"]),
        whatsapp_sent=_slice(int(wa_used), plan_limits["whatsapp_quota"]),
        email_sent=_slice(int(email_used), plan_limits["email_quota"]),
        payment_status=payment_status,
        subscription_expires_at=expires_at,
    )


def platform_summary(db: Session) -> PlatformUsageSummary:
    total_tenants = db.execute(select(func.count(Tenant.id))).scalar_one()
    active_tenants = db.execute(
        select(func.count(Tenant.id)).where(Tenant.status == TenantStatus.active)
    ).scalar_one()
    suspended_tenants = db.execute(
        select(func.count(Tenant.id)).where(Tenant.status == TenantStatus.suspended)
    ).scalar_one()
    total_schools = db.execute(select(func.count(School.id))).scalar_one()
    total_students = db.execute(
        select(func.count(Student.id)).where(Student.is_active.is_(True))
    ).scalar_one()
    total_staff = db.execute(
        select(func.count(User.id)).where(User.role == UserRole.staff, User.is_active.is_(True))
    ).scalar_one()
    total_parents = db.execute(
        select(func.count(User.id)).where(User.role == UserRole.parent, User.is_active.is_(True))
    ).scalar_one()

    today = date.today()
    window_start = today - timedelta(days=30)
    sms_30d, wa_30d, email_30d, storage_total = db.execute(
        select(
            func.coalesce(func.sum(TenantUsage.sms_sent), 0),
            func.coalesce(func.sum(TenantUsage.whatsapp_sent), 0),
            func.coalesce(func.sum(TenantUsage.email_sent), 0),
            func.coalesce(func.sum(TenantUsage.storage_used_mb), 0),
        ).where(TenantUsage.metric_date >= window_start)
    ).one()

    since_dt = datetime.now(timezone.utc) - timedelta(days=30)
    revenue_30d = db.execute(
        select(func.coalesce(func.sum(SubscriptionPayment.amount), 0)).where(
            SubscriptionPayment.status == PaymentStatus.success,
            SubscriptionPayment.paid_at >= since_dt,
        )
    ).scalar_one()

    renewals_due_by = datetime.now(timezone.utc) + timedelta(days=14)
    pending_renewals = db.execute(
        select(func.count(TenantSubscription.id)).where(
            TenantSubscription.status == SubscriptionStatus.active,
            TenantSubscription.expires_at <= renewals_due_by,
        )
    ).scalar_one()

    return PlatformUsageSummary(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        suspended_tenants=suspended_tenants,
        total_schools=total_schools,
        total_students=total_students,
        total_staff=total_staff,
        total_parents=total_parents,
        sms_sent_30d=int(sms_30d),
        whatsapp_sent_30d=int(wa_30d),
        email_sent_30d=int(email_30d),
        storage_used_mb=int(storage_total),
        revenue_30d=float(revenue_30d),
        pending_renewals=pending_renewals,
    )


# ---------- Renewal reminders ----------

def list_expiring_subscriptions(
    db: Session, *, within_days: int = 14
) -> list[dict]:
    """Find tenants with active subscriptions expiring soon."""
    horizon = datetime.now(timezone.utc) + timedelta(days=within_days)
    rows = db.execute(
        select(TenantSubscription, Tenant)
        .join(Tenant, TenantSubscription.tenant_id == Tenant.id)
        .where(
            TenantSubscription.status == SubscriptionStatus.active,
            TenantSubscription.expires_at.is_not(None),
            TenantSubscription.expires_at <= horizon,
            Tenant.status == TenantStatus.active,
        )
        .order_by(TenantSubscription.expires_at)
    ).all()
    today = datetime.now(timezone.utc)
    return [
        {
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "tenant_code": tenant.code,
            "subscription_id": sub.id,
            "expires_at": sub.expires_at,
            "days_remaining": (sub.expires_at - today).days if sub.expires_at else None,
            "contact_email": tenant.contact_email,
            "contact_mobile": tenant.contact_mobile,
        }
        for sub, tenant in rows
    ]


def send_renewal_reminders(
    db: Session, *, within_days: int = 14
) -> dict:
    """For each expiring tenant, create a Notice for school admins in that tenant.

    Uses the existing notice infrastructure — once SMS/email providers are wired,
    these reminders will dispatch via those channels automatically.
    """
    from app.core.enums import (
        NoticeAudience,
        NoticeChannel,
        NoticeStatus,
    )
    from app.models.notice import Notice
    from app.services import notice_service

    expiring = list_expiring_subscriptions(db, within_days=within_days)
    if not expiring:
        return {"tenants_notified": 0, "notices_created": 0}

    # Find a representative super_admin to use as created_by
    super_admin = db.execute(
        select(User).where(User.role == UserRole.super_admin).limit(1)
    ).scalar_one_or_none()
    created_by = super_admin.id if super_admin else None

    notices_created = 0
    for item in expiring:
        tenant_id = item["tenant_id"]
        # Pick a school in this tenant (notices are scoped to a school for now)
        school = db.execute(
            select(School).where(School.tenant_id == tenant_id).limit(1)
        ).scalar_one_or_none()
        if not school:
            continue

        days_left = item.get("days_remaining")
        title = "Subscription renewal reminder"
        body = (
            f"Your school's subscription expires on "
            f"{item['expires_at'].strftime('%d %b %Y')}"
            + (f" ({days_left} days from now)." if days_left is not None else ".")
            + " Please renew to avoid interruption. Contact support if you need help."
        )

        notice = Notice(
            tenant_id=tenant_id,
            school_id=school.id,
            title=title,
            body=body,
            audience=NoticeAudience.all_staff,
            channels=[
                NoticeChannel.in_app.value,
                NoticeChannel.email.value,
            ],
            status=NoticeStatus.draft,
            created_by_user_id=created_by,
        )
        db.add(notice)
        db.flush()
        # Dispatch immediately
        try:
            notice_service.send(db, notice.id, school.id)
            notices_created += 1
        except Exception:
            # No school admin users yet for this tenant — leave notice as draft
            continue

    return {
        "tenants_notified": notices_created,
        "notices_created": notices_created,
        "tenants_due": len(expiring),
    }


# ---------- CSV export ----------

def export_usage_csv(
    db: Session,
    *,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
) -> str:
    """Returns a CSV string of TenantUsage rows joined with tenant name."""
    import csv
    import io

    stmt = (
        select(TenantUsage, Tenant)
        .join(Tenant, TenantUsage.tenant_id == Tenant.id)
        .order_by(TenantUsage.metric_date.desc(), Tenant.name)
    )
    if from_date:
        stmt = stmt.where(TenantUsage.metric_date >= from_date)
    if to_date:
        stmt = stmt.where(TenantUsage.metric_date <= to_date)

    rows = db.execute(stmt).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "metric_date",
            "tenant_id",
            "tenant_name",
            "tenant_code",
            "students_count",
            "staff_count",
            "parents_count",
            "active_users_count",
            "sms_sent",
            "whatsapp_sent",
            "email_sent",
            "storage_used_mb",
        ]
    )
    for usage, tenant in rows:
        writer.writerow(
            [
                usage.metric_date.isoformat(),
                tenant.id,
                tenant.name,
                tenant.code,
                usage.students_count,
                usage.staff_count,
                usage.parents_count,
                usage.active_users_count,
                usage.sms_sent,
                usage.whatsapp_sent,
                usage.email_sent,
                usage.storage_used_mb,
            ]
        )
    return buf.getvalue()
