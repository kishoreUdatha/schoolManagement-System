"""End-to-end smoke test for the Super Admin module.

Run inside the backend container:
    docker exec sms-backend python -m scripts.smoketest_super_admin
"""
import json
import urllib.request
import urllib.error
import uuid

BASE = "http://localhost:8000/api/v1/super-admin"


def request(method: str, path: str, *, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def main() -> int:
    section("LOGIN")
    code, data = request("POST", "/auth/login", body={"email": "admin@sms.local", "password": "ChangeMe123!"})
    print(f"  {code} - user: {data.get('user', {}).get('email')}")
    assert code == 200, data
    token = data["access_token"]

    section("CREATE PLAN: Premium")
    plan_payload = {
        "name": "Premium",
        "tier": "premium",
        "description": "Full feature access",
        "price_monthly": "2999.00",
        "price_yearly": "29990.00",
        "student_limit": 2000,
        "staff_limit": 200,
        "storage_mb_limit": 51200,
        "sms_quota": 20000,
        "whatsapp_quota": 20000,
        "email_quota": 50000,
        "modules": [
            {"module_key": "attendance", "enabled": True},
            {"module_key": "homework", "enabled": True},
            {"module_key": "exams", "enabled": True},
            {"module_key": "fees", "enabled": True},
            {"module_key": "behaviour", "enabled": True},
            {"module_key": "digital_learning", "enabled": True},
            {"module_key": "ai_reports", "enabled": True},
            {"module_key": "ai_chatbot", "enabled": True},
            {"module_key": "whatsapp", "enabled": True},
            {"module_key": "sms", "enabled": True},
        ],
    }
    code, plan = request("POST", "/plans", token=token, body=plan_payload)
    if code in (400, 409) and "already exists" in str(plan.get("detail", "")):
        # a previous run left it behind and a tenant is on it, so reuse it
        code, listing = request("GET", "/plans", token=token)
        plan = next(p for p in listing["items"] if p["name"] == "Premium")
        code = 201
    print(f"  {code} - plan id={plan.get('id')} name={plan.get('name')} modules={len(plan.get('modules', []))}")
    assert code == 201, plan
    plan_id = plan["id"]

    section("LIST PLANS")
    code, listing = request("GET", "/plans", token=token)
    print(f"  {code} - total={listing.get('total')}")
    assert code == 200

    section("CREATE TENANT")
    unique = uuid.uuid4().hex[:6]
    tenant_payload = {
        "name": f"Demo School {unique}",
        "contact_email": f"contact-{unique}@demoschool.in",
        "contact_mobile": "+919876543210",
        "contact_person": "Mr. Principal",
        "school_admin_name": "School Admin",
        "school_admin_email": f"admin-{unique}@demoschool.in",
        "school_admin_phone": "+919876543211",
    }
    code, created = request("POST", "/tenants", token=token, body=tenant_payload)
    print(f"  {code} - tenant id={created.get('tenant', {}).get('id')} code={created.get('tenant', {}).get('code')}")
    print(f"    school admin email={created.get('school_admin_email')}")
    print(f"    temp password={created.get('school_admin_temporary_password')}")
    assert code == 201, created
    tenant_id = created["tenant"]["id"]

    section("LIST TENANTS")
    code, listing = request("GET", "/tenants", token=token)
    print(f"  {code} - total={listing.get('total')}")
    assert code == 200

    section("GET TENANT DETAIL")
    code, detail = request("GET", f"/tenants/{tenant_id}", token=token)
    print(f"  {code} - schools={len(detail.get('schools', []))} sub={detail.get('current_subscription')}")
    assert code == 200

    section("ASSIGN SUBSCRIPTION")
    code, sub = request(
        "POST", f"/tenants/{tenant_id}/subscription", token=token,
        body={"plan_id": plan_id, "billing_cycle": "yearly"},
    )
    print(f"  {code} - sub id={sub.get('id')} status={sub.get('status')} expires={sub.get('expires_at')}")
    assert code == 201, sub

    section("RECORD MANUAL PAYMENT")
    code, payment = request(
        "POST", f"/tenants/{tenant_id}/payments", token=token,
        body={"amount": "29990.00", "mode": "manual", "status": "success", "reference": "NEFT-12345"},
    )
    print(f"  {code} - payment id={payment.get('id')} amount={payment.get('amount')} status={payment.get('status')}")
    assert code == 201, payment

    section("LIST PAYMENTS")
    code, payments = request("GET", f"/tenants/{tenant_id}/payments", token=token)
    print(f"  {code} - total={payments.get('total')}")
    assert code == 200

    section("TENANT USAGE")
    code, usage = request("GET", f"/tenants/{tenant_id}/usage", token=token)
    print(f"  {code} - students {usage.get('students')} payment_status={usage.get('payment_status')}")
    assert code == 200

    section("PLATFORM SUMMARY")
    code, summary = request("GET", "/usage/summary", token=token)
    print(f"  {code}")
    for k, v in summary.items():
        print(f"    {k}: {v}")
    assert code == 200

    section("DEACTIVATE TENANT")
    code, updated = request("PATCH", f"/tenants/{tenant_id}/status", token=token, body={"status": "suspended"})
    print(f"  {code} - status={updated.get('status')} is_active={updated.get('is_active')}")
    assert code == 200, updated

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
