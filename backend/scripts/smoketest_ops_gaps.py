"""Smoke test for the concepts the screens reported missing.

Verifies:
    Interviews come back for a window in one call, which is what the calendar
    was opening eighty applications to work out.
    An asset with no service interval never appears as due — nobody has said
    it needs servicing, and "overdue forever" is not the same as unknown.
    An asset past its interval does appear, and says so.
    The warden rota names the nights nobody is covering, which is the only
    reason to look at it.
    A scheduled notice sits until something runs it, and running it sends it
    exactly once.

Run:
    docker exec sms-backend python -m scripts.smoketest_ops_gaps
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.core.enums import AssetEventKind, AssetStatus, NoticeStatus
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.hostel import Hostel
from app.models.hostel_ops import WardenDuty
from app.models.inventory import Asset, AssetEvent
from app.models.notice import Notice, NoticeRecipient
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-OPSGAP"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            payload = r.read()
            return r.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, {"raw": payload.decode(errors="ignore")[:200]}


def section(t):
    print(f"\n=== {t} ===")


def login():
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        u.password_hash = hash_password(ADMIN[1])
        db.commit()
    finally:
        db.close()
    code, data = request("POST", "/school/auth/login",
                         body={"email": ADMIN[0], "password": ADMIN[1]})
    assert code == 200, data
    return data["access_token"]


def cleanup():
    db = SessionLocal()
    try:
        assets = select(Asset.id).where(Asset.asset_tag.like(f"{TAG}%"))
        db.execute(AssetEvent.__table__.delete().where(AssetEvent.asset_id.in_(assets)))
        db.execute(Asset.__table__.delete().where(Asset.asset_tag.like(f"{TAG}%")))
        db.execute(WardenDuty.__table__.delete().where(WardenDuty.note == f"{TAG} duty"))
        notices = select(Notice.id).where(Notice.title.like(f"{TAG}%"))
        db.execute(NoticeRecipient.__table__.delete().where(
            NoticeRecipient.notice_id.in_(notices)))
        db.execute(Notice.__table__.delete().where(Notice.title.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def main():
    cleanup()
    tok = login()
    ids = devdata.school()

    try:
        section("Interviews for a window, in one call")
        today = date.today()
        code, ivs = request(
            "GET",
            f"/school/ops/interviews?from={today - timedelta(days=60)}&to={today + timedelta(days=60)}",
            token=tok)
        assert code == 200, ivs
        assert ivs["count"] == len(ivs["interviews"]), ivs
        for row in ivs["interviews"]:
            assert row["scheduled_at"] and "candidate_name" in row, row
        print(f"  {ivs['count']} interview(s) in a four-month window, one query")

        section("An asset nobody has scheduled is not overdue")
        db = SessionLocal()
        try:
            bare = Asset(**ids, asset_tag=f"{TAG}-BARE", name=f"{TAG} unscheduled",
                         status=AssetStatus.in_use,
                         purchase_date=today - timedelta(days=900))
            due = Asset(**ids, asset_tag=f"{TAG}-DUE", name=f"{TAG} overdue",
                        status=AssetStatus.in_use,
                        purchase_date=today - timedelta(days=900))
            db.add_all([bare, due])
            db.flush()
            due.service_every_days = 90
            db.add(AssetEvent(asset_id=due.id, kind=AssetEventKind.maintenance,
                              happened_on=today - timedelta(days=200),
                              notes=f"{TAG} last service"))
            db.commit()
            bare_id, due_id = bare.id, due.id
        finally:
            db.close()

        code, svc = request("GET", "/school/ops/assets/service-due?within_days=60",
                            token=tok)
        assert code == 200, svc
        tags = {a["asset_tag"] for a in svc["assets"]}
        assert f"{TAG}-BARE" not in tags, (
            "an asset with no interval and no warranty must not be called due")
        assert f"{TAG}-DUE" in tags, tags
        row = next(a for a in svc["assets"] if a["asset_tag"] == f"{TAG}-DUE")
        assert row["service_overdue"] is True, row
        assert row["last_serviced_on"], row
        print(f"  the unscheduled one stays out; the overdue one is "
              f"{(today - date.fromisoformat(row['service_due_on'])).days} day(s) late")

        section("Setting an interval brings it into view")
        code, set_it = request("PUT", f"/school/ops/assets/{bare_id}/service-interval",
                               token=tok, body={"service_every_days": 30})
        assert code == 200 and set_it["service_every_days"] == 30, set_it
        code, svc2 = request("GET", "/school/ops/assets/service-due?within_days=60",
                             token=tok)
        assert f"{TAG}-BARE" in {a["asset_tag"] for a in svc2["assets"]}, svc2
        code, cleared = request("PUT", f"/school/ops/assets/{bare_id}/service-interval",
                                token=tok, body={"service_every_days": None})
        assert cleared["service_every_days"] is None, cleared
        print("  set, seen; cleared, gone again")

        section("The rota names the nights nobody is covering")
        db = SessionLocal()
        try:
            hostel = db.execute(select(Hostel).where(
                Hostel.school_id == ids["school_id"])).scalars().first()
        finally:
            db.close()
        if hostel:
            code, before = request(
                "GET", f"/school/ops/warden-rota?from={today}&to={today + timedelta(days=2)}",
                token=tok)
            assert code == 200, before
            gaps_before = before["uncovered_count"]
            assert gaps_before > 0, "no duties yet, so every night is uncovered"

            code, made = request("POST", "/school/ops/warden-rota", token=tok, body={
                "hostel_id": hostel.id, "user_id": devdata.user_id("principal@dev.local"),
                "on_date": str(today), "shift": "night", "note": f"{TAG} duty"})
            assert code == 201, made
            code, after = request(
                "GET", f"/school/ops/warden-rota?from={today}&to={today + timedelta(days=2)}",
                token=tok)
            assert after["uncovered_count"] == gaps_before - 1, (
                gaps_before, after["uncovered_count"])
            assert after["days"], after
            print(f"  uncovered nights fell from {gaps_before} to "
                  f"{after['uncovered_count']} after one duty")
            request("DELETE", f"/school/ops/warden-rota/{made['duty_id']}", token=tok)
        else:
            print("  (no hostel in the seed to roster)")

        section("A scheduled notice waits, then goes exactly once")
        db = SessionLocal()
        try:
            n = Notice(**ids, title=f"{TAG} overdue notice", body="Due in the past",
                       audience="all_staff", channels=["in_app"],
                       status=NoticeStatus.scheduled,
                       scheduled_at=datetime.now(timezone.utc) - timedelta(hours=1))
            db.add(n)
            db.commit()
            notice_id = n.id
        finally:
            db.close()

        code, due_list = request("GET", "/school/ops/scheduled-notices", token=tok)
        assert code == 200, due_list
        assert any(d["notice_id"] == notice_id for d in due_list["due"]), due_list

        db = SessionLocal()
        try:
            before_recipients = db.execute(select(NoticeRecipient).where(
                NoticeRecipient.notice_id == notice_id)).scalars().all()
            assert not before_recipients, "a scheduled notice has reached nobody"
        finally:
            db.close()

        code, ran = request("POST", "/school/ops/scheduled-notices/run", token=tok)
        assert code == 200, ran
        assert any(s["notice_id"] == notice_id for s in ran["sent"]), ran
        db = SessionLocal()
        try:
            after_recipients = db.execute(select(NoticeRecipient).where(
                NoticeRecipient.notice_id == notice_id)).scalars().all()
            assert after_recipients, "running it created recipients"
            first_count = len(after_recipients)
        finally:
            db.close()

        code, again = request("POST", "/school/ops/scheduled-notices/run", token=tok)
        assert not any(s["notice_id"] == notice_id for s in again["sent"]), (
            "a sent notice must not go a second time")
        db = SessionLocal()
        try:
            final = db.execute(select(NoticeRecipient).where(
                NoticeRecipient.notice_id == notice_id)).scalars().all()
            assert len(final) == first_count, (len(final), first_count)
        finally:
            db.close()
        print(f"  reached nobody while scheduled, {first_count} on the run, "
              f"and nothing on the second run")

        print("\nALL OPS-GAP CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
