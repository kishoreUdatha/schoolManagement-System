"""Parents paying fees online through the school's own Razorpay account.

Flow: create_order -> Razorpay Checkout in the browser -> verify (signature
check) -> fees marked paid. The webhook applies the same payment if the
browser never comes back. Applying is idempotent, so both paths are safe.
"""
import hashlib
import hmac
import io
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core import crypto
from app.core.enums import FeeStatus, MoneyMode, OnlinePaymentStatus
from app.core.scoping import require_linked_child, section_label
from app.models.fee import FeeHead, StudentFee
from app.models.online_payment import (
    FeePaymentOrder,
    FeePaymentOrderItem,
    SchoolPaymentGateway,
)
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User
from app.schemas.online_payment import GatewayUpdate, VerifyRequest


RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders"
MOCK_SIGNATURE = "mock-signature"


def test_mode_available() -> bool:
    """Simulated checkout, so the flow can be exercised without Razorpay keys.
    Never offered outside development."""
    return settings.env.lower() in ("development", "dev", "local", "test")


# --- Gateway settings ---

def get_gateway(db: Session, school_id: int) -> Optional[SchoolPaymentGateway]:
    return db.execute(
        select(SchoolPaymentGateway).where(SchoolPaymentGateway.school_id == school_id)
    ).scalar_one_or_none()


def gateway_to_read(school_id: int, gw: Optional[SchoolPaymentGateway]) -> dict:
    return {
        "configured": gw is not None,
        "provider": "razorpay",
        "key_id": gw.key_id if gw else None,
        "mode": ("live" if gw.key_id.startswith("rzp_live_") else "test") if gw else None,
        "has_webhook_secret": bool(gw and gw.webhook_secret_enc),
        "is_enabled": bool(gw and gw.is_enabled),
        "webhook_url_path": f"/api/v1/public/payments/razorpay/{school_id}/webhook",
        "test_mode_available": test_mode_available(),
    }


def save_gateway(
    db: Session, tenant_id: int, school_id: int, data: GatewayUpdate
) -> SchoolPaymentGateway:
    gw = get_gateway(db, school_id)
    if gw is None:
        if not data.key_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="key_secret is required"
            )
        gw = SchoolPaymentGateway(tenant_id=tenant_id, school_id=school_id, provider="razorpay")
        db.add(gw)
    gw.key_id = data.key_id.strip()
    if data.key_secret:
        gw.key_secret_enc = crypto.encrypt(data.key_secret.strip())
    if data.webhook_secret:
        gw.webhook_secret_enc = crypto.encrypt(data.webhook_secret.strip())
    gw.is_enabled = data.is_enabled
    db.commit()
    db.refresh(gw)
    return gw


def delete_gateway(db: Session, school_id: int) -> None:
    gw = get_gateway(db, school_id)
    if gw:
        db.delete(gw)
        db.commit()


# --- Checkout ---

def _razorpay_create_order(gw: SchoolPaymentGateway, amount_paise: int, receipt: str, notes: dict) -> str:
    try:
        r = httpx.post(
            RAZORPAY_ORDERS_URL,
            auth=(gw.key_id, crypto.decrypt(gw.key_secret_enc)),
            json={"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes},
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Couldn't reach the payment gateway: {exc.__class__.__name__}",
        )
    if r.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The school's Razorpay keys were rejected. Please contact the school office.",
        )
    if r.status_code >= 400:
        detail = r.json().get("error", {}).get("description") if r.headers.get("content-type", "").startswith("application/json") else r.text
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Payment gateway error: {detail}")
    return r.json()["id"]


def create_order(db: Session, parent: User, student_id: int, fee_ids: list[int]) -> dict:
    student = require_linked_child(db, parent.id, student_id)
    fees = list(
        db.execute(
            select(StudentFee, FeeHead)
            .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
            .where(StudentFee.id.in_(set(fee_ids)), StudentFee.student_id == student.id)
        ).all()
    )
    if len(fees) != len(set(fee_ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Some fees weren't found for this child"
        )
    items = []
    for sf, head in fees:
        outstanding = sf.amount_due - sf.amount_paid
        if sf.status != FeeStatus.pending or outstanding <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{head.name} ({sf.period}) is already {sf.status.value}",
            )
        items.append((sf, head, outstanding))
    total = sum((o for _, _, o in items), Decimal("0"))
    amount_paise = int((total * 100).to_integral_value())

    gw = get_gateway(db, student.school_id)
    school = db.get(School, student.school_id)
    description = ", ".join(f"{h.name} {sf.period}" for sf, h, _ in items)[:250]
    if gw and gw.is_enabled:
        provider = "razorpay"
        provider_order_id = _razorpay_create_order(
            gw,
            amount_paise,
            receipt=f"S{student.id}-{uuid.uuid4().hex[:10]}",
            notes={"student_id": str(student.id), "admission_no": student.admission_no},
        )
    elif test_mode_available():
        provider = "mock"
        provider_order_id = f"mock_order_{uuid.uuid4().hex[:16]}"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Online payment isn't enabled for this school yet.",
        )

    order = FeePaymentOrder(
        tenant_id=student.tenant_id,
        school_id=student.school_id,
        student_id=student.id,
        parent_user_id=parent.id,
        amount=total,
        currency="INR",
        provider=provider,
        provider_order_id=provider_order_id,
        status=OnlinePaymentStatus.created,
    )
    db.add(order)
    db.flush()
    for sf, _, outstanding in items:
        db.add(FeePaymentOrderItem(order_id=order.id, student_fee_id=sf.id, amount=outstanding))
    db.commit()

    return {
        "order_id": order.id,
        "provider": provider,
        "provider_order_id": provider_order_id,
        "key_id": gw.key_id if provider == "razorpay" else None,
        "amount": total,
        "amount_paise": amount_paise,
        "currency": "INR",
        "school_name": school.name if school else "",
        "description": f"{student.full_name}: {description}",
        "prefill_name": parent.full_name,
        "prefill_email": parent.email,
        "prefill_contact": parent.phone,
    }


def _signature_ok(secret: str, message: str, signature: str) -> bool:
    expected = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _apply_paid(db: Session, order: FeePaymentOrder, payment_id: str) -> FeePaymentOrder:
    """Mark the order paid and credit each fee line. Idempotent."""
    order = db.execute(
        select(FeePaymentOrder).where(FeePaymentOrder.id == order.id).with_for_update()
    ).scalar_one()
    if order.status == OnlinePaymentStatus.paid:
        return order
    now = datetime.now(timezone.utc)
    excess = Decimal("0")
    items = db.execute(
        select(FeePaymentOrderItem).where(FeePaymentOrderItem.order_id == order.id)
    ).scalars().all()
    for it in items:
        sf = db.execute(
            select(StudentFee).where(StudentFee.id == it.student_fee_id).with_for_update()
        ).scalar_one()
        outstanding = sf.amount_due - sf.amount_paid if sf.status == FeeStatus.pending else Decimal("0")
        applied = min(it.amount, max(outstanding, Decimal("0")))
        it.applied_amount = applied
        excess += it.amount - applied
        if applied > 0:
            sf.amount_paid += applied
            sf.payment_mode = "online"
            sf.payment_ref = payment_id
            sf.recorded_by_user_id = order.parent_user_id
            if sf.amount_paid >= sf.amount_due:
                sf.status = FeeStatus.paid
                sf.paid_at = now
            from app.services import ledger_service  # local: avoids an import cycle via fee_service

            ledger_service.record_collection(
                db, sf, applied, MoneyMode.online, reference=payment_id,
                actor_id=order.parent_user_id, notes=f"Online order {order.id}",
            )
    order.status = OnlinePaymentStatus.paid
    order.provider_payment_id = payment_id
    order.paid_at = now
    order.failure_reason = None
    order.excess_amount = excess
    order.receipt_no = f"RCPT-{order.school_id}-{order.id:06d}"
    db.commit()
    db.refresh(order)
    return order


def verify(db: Session, parent: User, student_id: int, data: VerifyRequest) -> FeePaymentOrder:
    require_linked_child(db, parent.id, student_id)
    order = db.execute(
        select(FeePaymentOrder).where(
            FeePaymentOrder.provider_order_id == data.razorpay_order_id,
            FeePaymentOrder.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment order not found")
    if order.provider == "mock":
        ok = test_mode_available() and data.razorpay_signature == MOCK_SIGNATURE
    else:
        gw = get_gateway(db, order.school_id)
        ok = bool(gw) and _signature_ok(
            crypto.decrypt(gw.key_secret_enc),
            f"{data.razorpay_order_id}|{data.razorpay_payment_id}",
            data.razorpay_signature,
        )
    if not ok:
        if order.status != OnlinePaymentStatus.paid:
            order.status = OnlinePaymentStatus.failed
            order.failure_reason = "Signature verification failed"
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment could not be verified. If money was deducted, it will be confirmed automatically or refunded.",
        )
    return _apply_paid(db, order, data.razorpay_payment_id)


def mark_failed(db: Session, parent: User, student_id: int, order_id: int, reason: str) -> FeePaymentOrder:
    """Browser reports a cancelled/failed checkout. Never overrides 'paid'."""
    require_linked_child(db, parent.id, student_id)
    order = db.get(FeePaymentOrder, order_id)
    if not order or order.student_id != student_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment order not found")
    if order.status == OnlinePaymentStatus.created:
        order.status = OnlinePaymentStatus.failed
        order.failure_reason = reason[:300]
        db.commit()
    return order


def handle_webhook(db: Session, school_id: int, raw_body: bytes, signature: Optional[str]) -> dict:
    gw = get_gateway(db, school_id)
    if not gw or not gw.webhook_secret_enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not configured")
    if not signature or not _signature_ok(
        crypto.decrypt(gw.webhook_secret_enc), raw_body.decode(), signature
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bad signature")
    event = json.loads(raw_body)
    kind = event.get("event")
    payment = (event.get("payload", {}).get("payment") or {}).get("entity") or {}
    order_id = payment.get("order_id")
    if not order_id:
        return {"ignored": kind}
    order = db.execute(
        select(FeePaymentOrder).where(
            FeePaymentOrder.provider_order_id == order_id, FeePaymentOrder.school_id == school_id
        )
    ).scalar_one_or_none()
    if not order:
        return {"ignored": kind, "reason": "unknown order"}
    if kind in ("payment.captured", "order.paid"):
        _apply_paid(db, order, payment.get("id", ""))
        return {"applied": order.id}
    if kind == "payment.failed" and order.status == OnlinePaymentStatus.created:
        order.status = OnlinePaymentStatus.failed
        order.failure_reason = (payment.get("error_description") or "Payment failed")[:300]
        db.commit()
        return {"failed": order.id}
    return {"ignored": kind}


# --- Listing & receipts ---

def order_to_read(db: Session, o: FeePaymentOrder) -> dict:
    student = db.get(Student, o.student_id)
    parent = db.get(User, o.parent_user_id) if o.parent_user_id else None
    items = db.execute(
        select(FeePaymentOrderItem, StudentFee, FeeHead)
        .join(StudentFee, FeePaymentOrderItem.student_fee_id == StudentFee.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .where(FeePaymentOrderItem.order_id == o.id)
        .order_by(StudentFee.period)
    ).all()
    return {
        "id": o.id,
        "student_id": o.student_id,
        "student_name": student.full_name if student else "",
        "parent_name": parent.full_name if parent else None,
        "amount": o.amount,
        "currency": o.currency,
        "provider": o.provider,
        "provider_order_id": o.provider_order_id,
        "provider_payment_id": o.provider_payment_id,
        "status": o.status,
        "receipt_no": o.receipt_no,
        "paid_at": o.paid_at,
        "failure_reason": o.failure_reason,
        "excess_amount": o.excess_amount,
        "created_at": o.created_at,
        "items": [
            {
                "student_fee_id": sf.id,
                "fee_head_name": head.name,
                "period": sf.period,
                "amount": it.amount,
                "applied_amount": it.applied_amount,
            }
            for it, sf, head in items
        ],
    }


def list_orders(
    db: Session,
    school_id: int,
    *,
    student_id: Optional[int] = None,
    status_: Optional[OnlinePaymentStatus] = None,
    limit: int = 200,
) -> list[FeePaymentOrder]:
    stmt = select(FeePaymentOrder).where(FeePaymentOrder.school_id == school_id)
    if student_id:
        stmt = stmt.where(FeePaymentOrder.student_id == student_id)
    if status_:
        stmt = stmt.where(FeePaymentOrder.status == status_)
    return list(db.execute(stmt.order_by(FeePaymentOrder.created_at.desc()).limit(limit)).scalars())


def get_order(db: Session, order_id: int, school_id: int) -> FeePaymentOrder:
    o = db.get(FeePaymentOrder, order_id)
    if not o or o.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return o


def get_parent_order(db: Session, parent_user_id: int, student_id: int, order_id: int) -> FeePaymentOrder:
    require_linked_child(db, parent_user_id, student_id)
    o = db.get(FeePaymentOrder, order_id)
    if not o or o.student_id != student_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return o


def receipt_pdf(db: Session, o: FeePaymentOrder) -> tuple[bytes, str]:
    if o.status != OnlinePaymentStatus.paid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Receipts are issued for paid payments only"
        )
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    d = order_to_read(db, o)
    school = db.get(School, o.school_id)
    student = db.get(Student, o.student_id)
    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A5, leftMargin=1.2 * cm, rightMargin=1.2 * cm, topMargin=1.2 * cm)
    els = [
        Paragraph(f"<b>{school.name if school else ''}</b>", styles["Title"]),
        Paragraph((school.address or "") if school else "", styles["Normal"]),
        Spacer(1, 0.3 * cm),
        Paragraph("<b>FEE RECEIPT</b>", styles["Heading2"]),
    ]
    meta = [
        ["Receipt no.", d["receipt_no"]],
        ["Date", o.paid_at.astimezone().strftime("%d %b %Y, %I:%M %p") if o.paid_at else ""],
        ["Student", f"{d['student_name']} ({student.admission_no if student else ''})"],
        ["Class", section_label(db, student.section_id) if student else ""],
        ["Paid by", d["parent_name"] or ""],
        ["Mode", f"Online ({o.provider})"],
        ["Transaction ID", o.provider_payment_id or ""],
    ]
    t = Table(meta, colWidths=[3.5 * cm, 8.5 * cm])
    t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), colors.grey)]))
    els += [t, Spacer(1, 0.4 * cm)]
    rows = [["Fee", "Period", "Amount (Rs.)"]] + [
        [i["fee_head_name"], i["period"], f"{i['applied_amount']:,.2f}"] for i in d["items"]
    ]
    rows.append(["", "Total", f"{o.amount - o.excess_amount:,.2f}"])
    lines = Table(rows, colWidths=[6 * cm, 3 * cm, 3 * cm])
    lines.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f7")),
                ("ALIGN", (2, 0), (2, -1), "RIGHT"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -2), 0.25, colors.HexColor("#cbd5e1")),
            ]
        )
    )
    els.append(lines)
    if o.excess_amount > 0:
        els += [
            Spacer(1, 0.3 * cm),
            Paragraph(
                f"Rs. {o.excess_amount:,.2f} was received in excess of the dues and will be refunded or adjusted.",
                styles["Italic"],
            ),
        ]
    els += [Spacer(1, 0.6 * cm), Paragraph("This is a computer-generated receipt.", styles["Italic"])]
    doc.build(els)
    return buf.getvalue(), f"{d['receipt_no']}.pdf"
