"""Running the platform: billing, quotas, operator accounts, tickets,
announcements, settings and whether the thing is actually up.

Two rules run through this file.

The operator must not be able to lock themselves out. Deactivating the last
active super admin leaves nobody who can create another, and the only way
back is a hand-written SQL statement against production. So it is refused,
here, rather than trusted to whoever is clicking.

And a status is only reported when something checked it. A green tick beside
a service nobody probes is worse than no tick at all, because it is read as
evidence. Anything unverified says so in as many words.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.core.enums import (
    AnnouncementAudience,
    PaymentStatus,
    SubscriptionStatus,
    TenantStatus,
    TicketPriority,
    TicketStatus,
    UserRole,
)
from app.core.security import hash_password
from app.models.plan import Plan
from app.models.platform import (
    GlobalAnnouncement,
    PlatformSetting,
    SupportTicket,
    TicketReply,
)
from app.models.subscription import SubscriptionPayment, TenantSubscription
from app.models.tenant import Tenant
from app.models.usage import TenantUsage
from app.models.user import User

ZERO = Decimal("0")


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


# ---------- billing ----------


def billing_overview(db: Session) -> dict:
    """Every tenant's subscription, what they pay and what they have paid.

    There is no invoice table in this system and this does not invent one.
    What exists is a subscription, a plan price and a list of payments, so
    that is what is reported — a page that showed invoice numbers would be
    showing numbers nothing can reconcile against.
    """
    rows = db.execute(
        select(Tenant, TenantSubscription, Plan)
        .join(
            TenantSubscription,
            TenantSubscription.tenant_id == Tenant.id,
            isouter=True,
        )
        .join(Plan, Plan.id == TenantSubscription.plan_id, isouter=True)
        .order_by(Tenant.name)
    ).all()

    today = _now()
    soon = today + timedelta(days=30)

    tenants = []
    seen: set[int] = set()
    for tenant, sub, plan in rows:
        # A tenant can hold more than one subscription row over its life; the
        # newest is the one it is on.
        if tenant.id in seen:
            continue
        seen.add(tenant.id)

        paid = db.execute(
            select(func.coalesce(func.sum(SubscriptionPayment.amount), 0)).where(
                SubscriptionPayment.tenant_id == tenant.id,
                SubscriptionPayment.status == PaymentStatus.success,
            )
        ).scalar_one()
        last = db.execute(
            select(SubscriptionPayment)
            .where(SubscriptionPayment.tenant_id == tenant.id)
            .order_by(SubscriptionPayment.created_at.desc())
        ).scalars().first()

        price = None
        if plan and sub:
            price = (
                plan.price_yearly
                if sub.billing_cycle and sub.billing_cycle.value == "yearly"
                else plan.price_monthly
            )

        expires = sub.expires_at if sub else None
        tenants.append({
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "tenant_code": tenant.code,
            "tenant_status": tenant.status.value,
            "plan_name": plan.name if plan else None,
            "billing_cycle": sub.billing_cycle.value if sub and sub.billing_cycle else None,
            "subscription_status": sub.status.value if sub else None,
            "price": Decimal(price) if price is not None else None,
            "started_at": sub.started_at if sub else None,
            "expires_at": expires,
            "days_to_expiry": (expires - today).days if expires else None,
            "expiring_soon": bool(expires and today <= expires <= soon),
            "expired": bool(expires and expires < today),
            "total_paid": Decimal(paid),
            "last_payment_at": last.paid_at if last else None,
            "last_payment_status": last.status.value if last else None,
        })

    since = today - timedelta(days=30)
    revenue_30d = db.execute(
        select(func.coalesce(func.sum(SubscriptionPayment.amount), 0)).where(
            SubscriptionPayment.status == PaymentStatus.success,
            SubscriptionPayment.paid_at >= since,
        )
    ).scalar_one()
    failed_30d = db.execute(
        select(func.count(SubscriptionPayment.id)).where(
            SubscriptionPayment.status == PaymentStatus.failed,
            SubscriptionPayment.created_at >= since,
        )
    ).scalar_one()

    return {
        "tenants": tenants,
        "total_tenants": len(tenants),
        "on_a_plan": sum(1 for t in tenants if t["plan_name"]),
        "without_a_plan": sum(1 for t in tenants if not t["plan_name"]),
        "expiring_soon": sum(1 for t in tenants if t["expiring_soon"]),
        "expired": sum(1 for t in tenants if t["expired"]),
        "revenue_30d": Decimal(revenue_30d),
        "failed_payments_30d": failed_30d,
        "billed_monthly": sum(
            (t["price"] or ZERO) for t in tenants if t["billing_cycle"] == "monthly"
        ),
        # Stated rather than implied: there is nothing to raise an invoice from.
        "invoicing_modelled": False,
    }


# ---------- usage against quota ----------


def usage_overview(db: Session) -> dict:
    """Every tenant's usage against the plan they are on.

    Reuses usage_service per tenant rather than recomputing, so this page and
    the tenant's own usage card can never disagree about the same number.
    """
    from app.services import usage_service

    tenants = list(db.execute(select(Tenant).order_by(Tenant.name)).scalars())
    rows = []
    for tenant in tenants:
        try:
            u = usage_service.get_tenant_usage(db, tenant.id)
        except HTTPException:
            continue
        slices = {
            "students": u.students,
            "staff": u.staff,
            "storage_mb": u.storage_mb,
            "sms": u.sms_sent,
            "whatsapp": u.whatsapp_sent,
            "email": u.email_sent,
        }
        # "Over" only means anything where a limit was set. A plan with no
        # student limit is unlimited, not breached.
        over = [k for k, s in slices.items() if s.limit > 0 and s.used > s.limit]
        near = [
            k for k, s in slices.items()
            if s.limit > 0 and s.used <= s.limit and s.percent >= 80
        ]
        rows.append({
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "tenant_code": tenant.code,
            "tenant_status": tenant.status.value,
            "students": s_dict(u.students),
            "staff": s_dict(u.staff),
            "storage_mb": s_dict(u.storage_mb),
            "sms": s_dict(u.sms_sent),
            "whatsapp": s_dict(u.whatsapp_sent),
            "email": s_dict(u.email_sent),
            "parents": u.parents,
            "active_users": u.active_users,
            "over": over,
            "near": near,
            "no_limits_set": all(s.limit == 0 for s in slices.values()),
        })

    return {
        "tenants": rows,
        "total": len(rows),
        "over_quota": sum(1 for r in rows if r["over"]),
        "near_quota": sum(1 for r in rows if r["near"] and not r["over"]),
        "without_limits": sum(1 for r in rows if r["no_limits_set"]),
    }


def s_dict(slice_obj) -> dict:
    return {
        "used": slice_obj.used,
        "limit": slice_obj.limit,
        "percent": slice_obj.percent,
        "unlimited": slice_obj.limit == 0,
    }


# ---------- operator accounts ----------


def _active_super_admins(db: Session) -> int:
    return db.execute(
        select(func.count(User.id)).where(
            User.role == UserRole.super_admin, User.is_active.is_(True)
        )
    ).scalar_one()


def list_platform_users(db: Session) -> list[dict]:
    users = list(db.execute(
        select(User)
        .where(User.role == UserRole.super_admin)
        .order_by(User.full_name)
    ).scalars())
    active = sum(1 for u in users if u.is_active)
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "is_active": u.is_active,
            "last_login_at": u.last_login_at,
            "must_change_password": bool(getattr(u, "must_change_password", False)),
            # True when switching this one off would leave nobody.
            "is_last_active": u.is_active and active == 1,
        }
        for u in users
    ]


def create_platform_user(db: Session, full_name: str, email: str,
                         phone: Optional[str] = None) -> dict:
    email = email.strip().lower()
    clash = db.execute(select(User).where(func.lower(User.email) == email)).scalar_one_or_none()
    if clash:
        raise _400("Somebody already signs in with that address.")

    from app.services import student_portal_service

    password = student_portal_service.new_password()
    user = User(
        tenant_id=None,
        school_id=None,
        full_name=full_name.strip(),
        email=email,
        phone=phone,
        role=UserRole.super_admin,
        password_hash=hash_password(password),
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "password": password,
        "created": True,
    }


def set_platform_user_active(db: Session, user_id: int, active: bool) -> dict:
    user = db.get(User, user_id)
    if not user or user.role != UserRole.super_admin:
        raise _404("Platform user")

    if not active and user.is_active and _active_super_admins(db) <= 1:
        raise _400(
            "This is the last active platform administrator. Switching it off "
            "would leave nobody able to sign in and create another."
        )

    user.is_active = active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}


def reset_platform_password(db: Session, user_id: int) -> dict:
    user = db.get(User, user_id)
    if not user or user.role != UserRole.super_admin:
        raise _404("Platform user")

    from app.services import student_portal_service

    password = student_portal_service.new_password()
    user.password_hash = hash_password(password)
    user.must_change_password = True
    db.commit()
    return {"id": user.id, "email": user.email, "password": password}


# ---------- tickets ----------


def ticket_to_dict(db: Session, t: SupportTicket, *, internal: bool) -> dict:
    """One ticket. `internal` decides whether operator-only notes come back.

    The filter is here rather than in the route or the page, because a note
    hidden only by a component is one API call away from being read.
    """
    tenant = db.get(Tenant, t.tenant_id) if t.tenant_id else None
    raised = db.get(User, t.raised_by_user_id) if t.raised_by_user_id else None
    owner = db.get(User, t.assigned_to_user_id) if t.assigned_to_user_id else None

    replies = list(db.execute(
        select(TicketReply)
        .where(TicketReply.ticket_id == t.id)
        .order_by(TicketReply.created_at)
    ).scalars())
    if not internal:
        replies = [r for r in replies if not r.is_internal]

    return {
        "id": t.id,
        "tenant_id": t.tenant_id,
        "tenant_name": tenant.name if tenant else None,
        "raised_by": raised.full_name if raised else None,
        "subject": t.subject,
        "body": t.body,
        "status": t.status.value,
        "priority": t.priority.value,
        "assigned_to_user_id": t.assigned_to_user_id,
        "assigned_to": owner.full_name if owner else None,
        "resolved_at": t.resolved_at,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "replies": [
            {
                "id": r.id,
                "author": (db.get(User, r.author_user_id).full_name
                           if r.author_user_id and db.get(User, r.author_user_id) else None),
                "body": r.body,
                "is_internal": r.is_internal,
                "created_at": r.created_at,
            }
            for r in replies
        ],
        "reply_count": len(replies),
    }


def list_tickets(db: Session, *, state: Optional[TicketStatus] = None,
                 priority: Optional[TicketPriority] = None,
                 tenant_id: Optional[int] = None,
                 internal: bool = True) -> dict:
    stmt = select(SupportTicket)
    if state:
        stmt = stmt.where(SupportTicket.status == state)
    if priority:
        stmt = stmt.where(SupportTicket.priority == priority)
    if tenant_id:
        stmt = stmt.where(SupportTicket.tenant_id == tenant_id)
    rows = list(db.execute(
        stmt.order_by(SupportTicket.created_at.desc()).limit(300)
    ).scalars())

    counts = dict(db.execute(
        select(SupportTicket.status, func.count(SupportTicket.id))
        .group_by(SupportTicket.status)
    ).all())

    return {
        "tickets": [ticket_to_dict(db, t, internal=internal) for t in rows],
        "open": counts.get(TicketStatus.open, 0),
        "waiting": counts.get(TicketStatus.waiting, 0),
        "resolved": counts.get(TicketStatus.resolved, 0),
        "closed": counts.get(TicketStatus.closed, 0),
        "urgent_open": db.execute(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.status == TicketStatus.open,
                SupportTicket.priority == TicketPriority.urgent,
            )
        ).scalar_one(),
    }


def get_ticket(db: Session, ticket_id: int, *, internal: bool = True) -> dict:
    t = db.get(SupportTicket, ticket_id)
    if not t:
        raise _404("Ticket")
    return ticket_to_dict(db, t, internal=internal)


def create_ticket(db: Session, user_id: int, subject: str, body: str, *,
                  tenant_id: Optional[int] = None,
                  priority: TicketPriority = TicketPriority.normal) -> dict:
    if tenant_id and not db.get(Tenant, tenant_id):
        raise _404("Tenant")
    t = SupportTicket(
        tenant_id=tenant_id,
        raised_by_user_id=user_id,
        subject=subject.strip(),
        body=body.strip(),
        priority=priority,
        status=TicketStatus.open,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return ticket_to_dict(db, t, internal=True)


def update_ticket(db: Session, ticket_id: int, *,
                  state: Optional[TicketStatus] = None,
                  priority: Optional[TicketPriority] = None,
                  assigned_to_user_id: Optional[int] = None) -> dict:
    t = db.get(SupportTicket, ticket_id)
    if not t:
        raise _404("Ticket")
    if state is not None:
        t.status = state
        # Resolving stamps the time; reopening clears it, so "resolved_at"
        # never describes a ticket that is open again.
        t.resolved_at = _now() if state in (TicketStatus.resolved, TicketStatus.closed) else None
    if priority is not None:
        t.priority = priority
    if assigned_to_user_id is not None:
        owner = db.get(User, assigned_to_user_id)
        if not owner or owner.role != UserRole.super_admin:
            raise _400("A ticket is assigned to a platform administrator.")
        t.assigned_to_user_id = assigned_to_user_id
    db.commit()
    return ticket_to_dict(db, t, internal=True)


def reply_to_ticket(db: Session, ticket_id: int, user_id: int, body: str, *,
                    is_internal: bool = False) -> dict:
    t = db.get(SupportTicket, ticket_id)
    if not t:
        raise _404("Ticket")
    if not body or len(body.strip()) < 2:
        raise _400("Write something.")
    db.add(TicketReply(
        ticket_id=ticket_id,
        author_user_id=user_id,
        body=body.strip(),
        is_internal=is_internal,
    ))
    # A visible reply puts the ball in the school's court; an internal note
    # does not, so it must not quietly change the state.
    if not is_internal and t.status == TicketStatus.open:
        t.status = TicketStatus.waiting
    db.commit()
    return ticket_to_dict(db, t, internal=True)


# ---------- announcements ----------


def announcement_to_dict(a: GlobalAnnouncement, today: Optional[date] = None) -> dict:
    today = today or date.today()
    live = (
        a.is_active
        and a.starts_on <= today
        and (a.ends_on is None or a.ends_on >= today)
    )
    return {
        "id": a.id,
        "title": a.title,
        "body": a.body,
        "audience": a.audience.value,
        "starts_on": a.starts_on,
        "ends_on": a.ends_on,
        "is_active": a.is_active,
        "live": live,
        "scheduled": a.is_active and a.starts_on > today,
        "finished": bool(a.is_active and a.ends_on and a.ends_on < today),
        "created_at": a.created_at,
    }


def list_announcements(db: Session, *, live_only: bool = False) -> dict:
    rows = list(db.execute(
        select(GlobalAnnouncement).order_by(GlobalAnnouncement.starts_on.desc())
    ).scalars())
    items = [announcement_to_dict(a) for a in rows]
    if live_only:
        items = [i for i in items if i["live"]]
    return {
        "announcements": items,
        "live": sum(1 for i in items if i["live"]),
        "scheduled": sum(1 for i in items if i["scheduled"]),
        "finished": sum(1 for i in items if i["finished"]),
    }


def create_announcement(db: Session, user_id: int, *, title: str, body: str,
                        audience: AnnouncementAudience, starts_on: date,
                        ends_on: Optional[date] = None,
                        is_active: bool = True) -> dict:
    if ends_on and ends_on < starts_on:
        raise _400("It cannot finish before it starts.")
    a = GlobalAnnouncement(
        title=title.strip(), body=body.strip(), audience=audience,
        starts_on=starts_on, ends_on=ends_on, is_active=is_active,
        created_by_user_id=user_id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return announcement_to_dict(a)


def update_announcement(db: Session, announcement_id: int, **fields) -> dict:
    a = db.get(GlobalAnnouncement, announcement_id)
    if not a:
        raise _404("Announcement")
    for k, v in fields.items():
        if v is not None and hasattr(a, k):
            setattr(a, k, v)
    if a.ends_on and a.ends_on < a.starts_on:
        raise _400("It cannot finish before it starts.")
    db.commit()
    return announcement_to_dict(a)


def delete_announcement(db: Session, announcement_id: int) -> None:
    a = db.get(GlobalAnnouncement, announcement_id)
    if not a:
        raise _404("Announcement")
    db.delete(a)
    db.commit()


# ---------- settings ----------

# The knobs the operator is expected to turn, with what each one means. A key
# outside this list is still storable — the table is free-form on purpose —
# but these are the ones the screen offers, so nobody has to guess a spelling.
KNOWN_SETTINGS: dict[str, str] = {
    "support_email": "Where schools are told to write when something is wrong.",
    "support_phone": "The number printed on the support screen.",
    "maintenance_mode": "When on, schools see a maintenance notice instead of the app.",
    "maintenance_message": "What that notice says.",
    "signup_open": "Whether new tenants can be created at all.",
    "default_trial_days": "How long a new tenant runs before a plan is needed.",
    "renewal_reminder_days": "How many days before expiry a reminder goes out.",
}


def list_settings(db: Session) -> list[dict]:
    rows = {
        s.key: s for s in db.execute(select(PlatformSetting)).scalars()
    }
    out = []
    for key, description in KNOWN_SETTINGS.items():
        s = rows.get(key)
        out.append({
            "key": key,
            "value": s.value if s else None,
            "description": description,
            "set": s is not None,
            "updated_at": s.updated_at if s else None,
        })
    # Anything set outside the known list still shows, rather than becoming a
    # row only the database knows about.
    for key, s in rows.items():
        if key not in KNOWN_SETTINGS:
            out.append({
                "key": key,
                "value": s.value,
                "description": s.description,
                "set": True,
                "updated_at": s.updated_at,
            })
    return out


def set_setting(db: Session, user_id: int, key: str, value,
                description: Optional[str] = None) -> dict:
    key = key.strip()
    if not key:
        raise _400("A setting needs a name.")
    s = db.execute(
        select(PlatformSetting).where(PlatformSetting.key == key)
    ).scalar_one_or_none()
    # JSONB holds an object; a bare scalar is wrapped so the column shape is
    # the same whatever the setting happens to be.
    stored = value if isinstance(value, dict) else {"value": value}
    if s is None:
        s = PlatformSetting(
            key=key, value=stored,
            description=description or KNOWN_SETTINGS.get(key),
            updated_by_user_id=user_id,
        )
        db.add(s)
    else:
        s.value = stored
        if description:
            s.description = description
        s.updated_by_user_id = user_id
    db.commit()
    db.refresh(s)
    return {
        "key": s.key, "value": s.value, "description": s.description,
        "set": True, "updated_at": s.updated_at,
    }


def delete_setting(db: Session, key: str) -> None:
    s = db.execute(
        select(PlatformSetting).where(PlatformSetting.key == key)
    ).scalar_one_or_none()
    if not s:
        raise _404("Setting")
    db.delete(s)
    db.commit()


# ---------- is it up ----------


def health(db: Session) -> dict:
    """What is actually checked, and what is not.

    The app answers, and the database answers a query. That is the whole of
    what this deployment probes. Storage, the payment gateway and the SMS and
    email senders are listed because an operator will look for them, but every
    one of them is marked unmonitored rather than given a tick nothing earned.
    """
    checks = []

    checks.append({
        "name": "Application",
        "state": "up",
        "detail": "This request was served, so the app is running.",
        "monitored": True,
    })

    started = _now()
    try:
        db.execute(text("SELECT 1"))
        ms = round((_now() - started).total_seconds() * 1000, 1)
        checks.append({
            "name": "Database",
            "state": "up",
            "detail": f"Answered a query in {ms} ms.",
            "monitored": True,
        })
    except Exception as e:
        checks.append({
            "name": "Database",
            "state": "down",
            "detail": f"{type(e).__name__}: {str(e)[:120]}",
            "monitored": True,
        })

    from app.config import settings

    def configured(*names: str) -> bool:
        return any(getattr(settings, n, "") for n in names)

    # Configured is not the same as working. Saying so is the point.
    for name, fields, note in (
        ("Email delivery", ("aws_access_key_id",),
         "Credentials only. No mailer is wired in, so messages are recorded as skipped."),
        ("SMS", ("msg91_auth_key",), "Credentials only. Nothing probes the gateway."),
        ("WhatsApp", ("twilio_account_sid", "twilio_auth_token"),
         "Credentials only. Nothing probes the gateway."),
        ("File storage", ("s3_bucket", "storage_dir"),
         "Uploads are written to disk, but nothing probes the store."),
    ):
        checks.append({
            "name": name,
            "state": "configured" if configured(*fields) else "not_configured",
            "detail": note,
            "monitored": False,
        })

    today = date.today()
    return {
        "checked_at": _now(),
        "checks": checks,
        "all_monitored_up": all(c["state"] == "up" for c in checks if c["monitored"]),
        "unmonitored": sum(1 for c in checks if not c["monitored"]),
        # A little live context, so the page is worth opening during an incident.
        "tenants_active": db.execute(
            select(func.count(Tenant.id)).where(Tenant.status == TenantStatus.active)
        ).scalar_one(),
        "users_active": db.execute(
            select(func.count(User.id)).where(User.is_active.is_(True))
        ).scalar_one(),
        "usage_rows_today": db.execute(
            select(func.count(TenantUsage.id)).where(TenantUsage.metric_date == today)
        ).scalar_one(),
        "open_tickets": db.execute(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.status == TicketStatus.open
            )
        ).scalar_one(),
    }
