"""Smoke test for the full admission form (services/admission_form.py).

Checks the built-in required fields, the school default and a class that
differs; the format checks (Aadhaar, PEN, PIN, mobile, options, dates); that a
draft may be incomplete but submitting lists what is missing; that admitting
carries every field into the student's profile; and that the profile can be
edited. Runs in one transaction that is rolled back: nothing is kept.

Run:
    docker exec sms-backend python -m scripts.smoketest_admission_form
"""
from __future__ import annotations

import logging
import sys
from datetime import date

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import ApplicationStatus, UserRole
from app.database import engine
from app.models.academic import AcademicYear, Section
from app.models.admission_form import StudentProfile
from app.models.student import Student
from app.models.user import User
from app.schemas.application import AdmitIn, ApplicationIn
from app.services import admission_form as af
from app.services import application_service as apps

failures: list[str] = []


def check(label, got, want):
    ok = got == want
    print(f"  {'ok  ' if ok else 'FAIL'} {label}: {got}" + ("" if ok else f" (wanted {want})"))
    if not ok:
        failures.append(label)


def refused(label, fn, contains=""):
    try:
        fn()
    except HTTPException as e:
        good = contains in str(e.detail)
        print(f"  {'ok  ' if good else 'FAIL'} {label}: refused ({e.detail})")
        if not good:
            failures.append(label)
        return
    print(f"  FAIL {label}: was accepted")
    failures.append(label)


def main() -> int:
    engine.echo = False
    logging.disable(logging.WARNING)
    conn = engine.connect()
    outer = conn.begin()
    db = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        run(db)
    finally:
        db.close()
        outer.rollback()
        conn.close()
    print("\nrolled back; nothing kept")
    if failures:
        print(f"{len(failures)} check(s) failed: {', '.join(failures)}")
        return 1
    print("all checks passed")
    return 0


def run(db: Session) -> None:
    user = db.execute(select(User).where(User.role == UserRole.school_admin, User.school_id.is_not(None)).order_by(User.id)).scalars().first()
    sid = user.school_id
    year = db.execute(select(AcademicYear).where(AcademicYear.school_id == sid, AcademicYear.is_current.is_(True))).scalars().first()
    sec = db.execute(select(Section).join(Student, Student.section_id == Section.id).where(Student.school_id == sid)).scalars().first()
    cls = sec.class_id
    print(f"school {sid}, class {cls}, section {sec.id}")

    print("the fields")
    check("75 fields in 9 sections", (len(af.FIELDS), len(af.SECTIONS)), (75, 9))
    f = af.form(db, sid, None)
    req = {x["key"] for s in f["sections"] for x in s["fields"] if x["required"]}
    check("built-in required", req, af.DEFAULT_REQUIRED)

    print("school default and a class that differs")
    af.save_settings(db, user, None, ["category", "comm_pin"], ["caste", "sub_caste"])
    r, h = af.rules(db, sid, None)
    check("default keeps the always-required fields", af.ALWAYS <= r and {"category", "comm_pin"} <= r, True)
    check("default hides", h, {"caste", "sub_caste"})
    af.save_settings(db, user, cls, ["pen_no", "tc_number", "declaration"], [])
    r2, h2 = af.rules(db, sid, cls)
    check("class override", ({"pen_no", "tc_number", "declaration"} <= r2, "category" in r2, h2), (True, False, set()))
    refused("hiding an always-asked field", lambda: af.save_settings(db, user, None, [], ["phone"]), "always")
    refused("required and hidden at once", lambda: af.save_settings(db, user, None, ["caste"], ["caste"]), "both")
    refused("unknown field", lambda: af.save_settings(db, user, None, ["shoe_size"], []), "Unknown")

    print("format checks")
    refused("Aadhaar of 11 digits", lambda: af.clean_details({"aadhaar_no": "12345678901"}), "12 digits")
    refused("PEN of 10 digits", lambda: af.clean_details({"pen_no": "1234567890"}), "11 digits")
    refused("PIN starting with 0", lambda: af.clean_details({"comm_pin": "012345"}), "PIN")
    refused("mobile of 9 digits", lambda: af.clean_details({"father_mobile": "987654321"}), "mobile")
    refused("religion not on the list", lambda: af.clean_details({"religion": "Jedi"}), "listed")
    refused("TC dated in the future", lambda: af.clean_details({"tc_date": "2999-01-01"}), "future")
    c = af.clean_details({"aadhaar_no": "1234 5678 9012", "comm_pin": "500 081", "permanent_same": True,
                          "comm_city": "Hyderabad", "unknown": "x", "father_name": "ignored here"})
    check("spaces removed, permanent copied, unknown and core keys dropped",
          (c.get("aadhaar_no"), c.get("comm_pin"), c.get("perm_city"), "unknown" in c, "father_name" in c),
          ("123456789012", "500081", "Hyderabad", False, False))

    print("draft, submit, admit")
    base = dict(academic_year_id=year.id, class_id=cls, student_name="Smoke Applicant", guardian_name="Smoke Parent",
                phone="9876543210", dob=date(2019, 5, 1), gender="female")
    a = apps.create(db, user.tenant_id, sid, ApplicationIn(**base, details={"comm_city": "Hyderabad"}), user.id)
    check("an incomplete draft is kept", a.status, ApplicationStatus.draft)
    check("address filled from the communication address", a.address, "Hyderabad")
    refused("submit lists what is missing", lambda: apps.submit(db, user, a.id, sid), "PEN (UDISE+)")
    details = {"pen_no": "12345678901", "tc_number": "TC/24/118", "declaration": True, "aadhaar_no": "123412341234",
               "religion": "Hindu", "mother_tongue": "Telugu", "father_occupation": "Engineer", "father_income": "₹5–10 lakh",
               "comm_line1": "Plot 4", "comm_city": "Hyderabad", "comm_state": "Telangana", "comm_pin": "500072",
               "permanent_same": True, "blood_group": "B+", "allergies": "Peanuts"}
    apps.update(db, user, a.id, ApplicationIn(**base, father_name="Smoke Father", category="OBC", details=details))
    a = apps.submit(db, user, a.id, sid)
    check("submitted once complete", a.status, ApplicationStatus.submitted)
    check("address composed", a.address, "Plot 4, Hyderabad, Telangana - 500072")
    read = apps.detail(db, sid, a.id)
    check("read carries details and nothing missing", (read["details"].get("perm_pin"), read["missing"]), ("500072", []))
    refused("emptying a required field after submitting",
            lambda: apps.update(db, user, a.id, ApplicationIn(**base, details={**details, "pen_no": ""})), "PEN")
    a.status = ApplicationStatus.approved  # documents are not this test's business
    db.commit()
    res = apps.admit(db, user, a.id, AdmitIn(academic_year_id=year.id, section_id=sec.id, create_parent_login=False))
    st = db.get(Student, res["student_id"])
    prof = db.execute(select(StudentProfile).where(StudentProfile.student_id == st.id)).scalars().first()
    check("student gets blood group and address", (st.blood_group, st.address), ("B+", "Plot 4, Hyderabad, Telangana - 500072"))
    check("profile has the form", (prof.details.get("pen_no"), prof.details.get("father_name"), prof.details.get("category"),
                                   prof.details.get("allergies")), ("12345678901", "Smoke Father", "OBC", "Peanuts"))

    print("the student's admission details")
    d = af.student_details(db, sid, st.id)
    check("values include the student record", (d["values"]["student_name"], d["values"]["dob"], d["values"]["gender"]),
          ("Smoke Applicant", "2019-05-01", "female"))
    d2 = af.save_student_details(db, user, st.id, {**d["values"], "comm_city": "Secunderabad", "comm_line1": "Plot 9",
                                                   "comm_state": "Telangana", "comm_pin": "500003", "father_name": "Smoke Dad"})
    st = db.get(Student, st.id)
    check("edit saved; student address follows", (d2["values"]["father_name"], st.address),
          ("Smoke Dad", "Plot 9, Secunderabad, Telangana - 500003"))
    refused("bad Aadhaar on the profile", lambda: af.save_student_details(db, user, st.id, {"aadhaar_no": "12"}), "12 digits")
    af.clear_class(db, user, cls)
    r3, _ = af.rules(db, sid, cls)
    check("clearing a class falls back to the default", ("category" in r3, "pen_no" in r3), (True, False))


if __name__ == "__main__":
    sys.exit(main())
