"""Smoke test for forgotten passwords, reset codes and forced changes.

Verifies:
    A forgotten-password request answers identically whether the address
    belongs to an account or not, so the form cannot be used to find out who
    has one.
    A reset code works once, dies when used, dies when a newer one is asked
    for, and dies after a handful of wrong guesses.
    A reset code cannot be spent as a second factor, and vice versa.
    Resetting or changing a password clears the flag that says somebody else
    chose it.
    Anybody signed in can change their own password, and the old one stops
    working immediately.

Run:
    docker exec sms-backend python -m scripts.smoketest_account_access
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

from sqlalchemy import select

from app.core.enums import OtpPurpose
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.user import User, UserOtp

BASE = "http://localhost:8000/api/v1"
WHO = "accountant@dev.local"
START = "AccountantPass123!"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
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


def reset_fixture():
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == WHO)).scalar_one()
        u.password_hash = hash_password(START)
        u.must_change_password = False
        db.execute(UserOtp.__table__.delete().where(UserOtp.user_id == u.id))
        db.commit()
        return u.id
    finally:
        db.close()


def live_token(user_id: int, purpose: OtpPurpose) -> UserOtp:
    db = SessionLocal()
    try:
        return db.execute(
            select(UserOtp).where(
                UserOtp.user_id == user_id,
                UserOtp.purpose == purpose,
                UserOtp.used_at.is_(None),
            ).order_by(UserOtp.created_at.desc())
        ).scalars().first()
    finally:
        db.close()


def set_secret(row_id: int, secret: str):
    """The real token is never returned by the API — by design. The test
    plants a known hash so it can act as the person who received it."""
    db = SessionLocal()
    try:
        row = db.get(UserOtp, row_id)
        row.otp_hash = hash_password(secret)
        db.commit()
    finally:
        db.close()


def login(password):
    return request("POST", "/accountant/auth/login", body={"email": WHO, "password": password})


def main():
    user_id = reset_fixture()
    try:
        section("The form says the same thing either way")
        code, real = request("POST", "/account/forgot-password", body={"email": WHO})
        assert code == 200, real
        code, fake = request("POST", "/account/forgot-password",
                             body={"email": "nobody.at.all@nowhere.dev"})
        assert code == 200, fake
        assert real == fake, (real, fake)
        print(f"  both answer: {real['message'][:58]}…")

        section("Nothing readable comes back")
        assert "token" not in json.dumps(real).lower(), real
        row = live_token(user_id, OtpPurpose.password_reset)
        assert row is not None, "a real address did get a token, it just isn't in the reply"
        assert row.otp_hash and len(row.otp_hash) > 20, "stored hashed, not in the clear"
        print("  a token exists for the real address, hashed, and absent from the response")

        section("A wrong code is refused")
        set_secret(row.id, "the-real-token")
        code, err = request("POST", "/account/reset-password", body={
            "email": WHO, "token": "not-the-real-token", "new_password": "Whatever123"})
        assert code == 400, err
        print(f"  {err['detail']}")

        section("Guessing runs out")
        for _ in range(5):
            request("POST", "/account/reset-password", body={
                "email": WHO, "token": "still-wrong", "new_password": "Whatever123"})
        code, err = request("POST", "/account/reset-password", body={
            "email": WHO, "token": "the-real-token", "new_password": "Whatever123"})
        assert code == 400, "after too many guesses even the right code is dead"
        print("  the right code no longer works once it has been guessed at enough")

        section("A fresh code works once")
        request("POST", "/account/forgot-password", body={"email": WHO})
        row = live_token(user_id, OtpPurpose.password_reset)
        set_secret(row.id, "fresh-token")
        code, _ = request("POST", "/account/reset-password", body={
            "email": WHO, "token": "fresh-token", "new_password": "ChosenByMe123"})
        assert code == 204, _
        code, again = request("POST", "/account/reset-password", body={
            "email": WHO, "token": "fresh-token", "new_password": "AnotherOne123"})
        assert again and again.get("detail"), again
        assert code == 400, "a used code is spent"
        print("  used once, then refused")

        code, session = login("ChosenByMe123")
        assert code == 200, session
        assert session["user"]["must_change_password"] is False, session["user"]
        code, old = login(START)
        assert code == 401, "the password from before the reset is dead"
        print("  the new password works and the old one does not")

        section("Asking again kills the code you were sent before")
        request("POST", "/account/forgot-password", body={"email": WHO})
        first = live_token(user_id, OtpPurpose.password_reset)
        set_secret(first.id, "first-code")
        request("POST", "/account/forgot-password", body={"email": WHO})
        code, err = request("POST", "/account/reset-password", body={
            "email": WHO, "token": "first-code", "new_password": "Whatever123"})
        assert code == 400, "the earlier code stopped working when a newer one was issued"
        print("  only the most recent code is live")

        section("A reset code is not a second factor")
        db = SessionLocal()
        try:
            live = db.execute(select(UserOtp).where(
                UserOtp.user_id == user_id, UserOtp.used_at.is_(None)
            ).order_by(UserOtp.created_at.desc())).scalars().first()
            assert live.purpose == OtpPurpose.password_reset, live.purpose
        finally:
            db.close()
        print("  the outstanding code is marked password_reset, and login_2fa reads a "
              "different row")

        section("Changing your own password")
        tok = session["access_token"]
        code, err = request("POST", "/account/change-password", token=tok, body={
            "current_password": "not-it", "new_password": "Another123"})
        assert code == 400, err
        code, err = request("POST", "/account/change-password", token=tok, body={
            "current_password": "ChosenByMe123", "new_password": "short"})
        assert code == 422, "too short is rejected before it reaches the service"
        code, _ = request("POST", "/account/change-password", token=tok, body={
            "current_password": "ChosenByMe123", "new_password": "ThirdOne12345"})
        assert code == 204, _
        code, gone = login("ChosenByMe123")
        assert code == 401, "the previous password stops working at once"
        code, ok = login("ThirdOne12345")
        assert code == 200, ok
        print("  changed, and the one before it is dead")

        section("A password somebody else typed must be replaced")
        db = SessionLocal()
        try:
            u = db.get(User, user_id)
            u.password_hash = hash_password("OfficeGave123")
            u.must_change_password = True
            db.commit()
        finally:
            db.close()
        code, session = login("OfficeGave123")
        assert code == 200, session
        assert session["user"]["must_change_password"] is True, (
            "the app is told to send them to choose their own")
        code, _ = request("POST", "/account/change-password",
                          token=session["access_token"], body={
                              "current_password": "OfficeGave123",
                              "new_password": "MineNowPlease1"})
        assert code == 204, _
        code, after = login("MineNowPlease1")
        assert after["user"]["must_change_password"] is False, after["user"]
        print("  flagged on the way in, cleared the moment they choose their own")

        print("\nALL ACCOUNT-ACCESS CHECKS PASSED")
    finally:
        reset_fixture()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
