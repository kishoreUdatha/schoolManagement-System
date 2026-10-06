"""The full admission form: every field a school asks for, in one place.

The fields an Indian school records at admission — the student's identity
(Aadhaar, APAAR ID, PEN for UDISE+), previous schooling, both parents,
the primary contact, the two addresses, languages, transport, health and the
declaration. A handful are columns on the application already (CORE: name,
date of birth, gender, phones…); the rest travel in the application's
`details` and, once the child is admitted, the student's profile.

Each school decides which fields are required and which are not asked at
all — once for every class, and again for any class that differs (PEN and a
transfer certificate from Class 2 up, say). Name, primary contact and mobile
are always required: an application cannot exist without them.
"""
import re
from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.admission_form import AdmissionFormSetting
from app.models.academic import SchoolClass

STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep",
    "Puducherry",
]
INCOME = ["Below ₹1 lakh", "₹1–3 lakh", "₹3–5 lakh", "₹5–10 lakh", "₹10–25 lakh", "Above ₹25 lakh"]
LANGUAGES = ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati",
             "Odia", "Punjabi", "Urdu", "Sanskrit", "French", "German", "Other"]

SECTIONS = [
    ("student", "Student details"),
    ("previous", "Previous schooling"),
    ("father", "Father"),
    ("mother", "Mother"),
    ("contact", "Primary contact"),
    ("address", "Address"),
    ("other", "Languages, siblings and transport"),
    ("health", "Health"),
    ("declaration", "Declaration"),
]


def _f(key, label, section, type_="text", options=None, core=False, help=None):
    return {"key": key, "label": label, "section": section, "type": type_, "options": options,
            "core": core, "help": help}


def _parent(who: str, title: str) -> list[dict]:
    return [
        _f(f"{who}_name", f"{title}'s name", who, core=True),
        _f(f"{who}_mobile", "Mobile", who, "phone"),
        _f(f"{who}_email", "Email", who, "email"),
        _f(f"{who}_qualification", "Qualification", who),
        _f(f"{who}_occupation", "Occupation", who),
        _f(f"{who}_organisation", "Organisation", who),
        _f(f"{who}_designation", "Designation", who),
        _f(f"{who}_income", "Annual income", who, "select", INCOME),
        _f(f"{who}_aadhaar", "Aadhaar number", who, "aadhaar"),
    ]


def _address(prefix: str, section: str, what: str) -> list[dict]:
    return [
        _f(f"{prefix}_line1", f"{what}: house and street", section),
        _f(f"{prefix}_area", f"{what}: area / locality", section),
        _f(f"{prefix}_city", f"{what}: city / town", section),
        _f(f"{prefix}_district", f"{what}: district", section),
        _f(f"{prefix}_state", f"{what}: state", section, "select", STATES),
        _f(f"{prefix}_pin", f"{what}: PIN code", section, "pin"),
    ]


FIELDS: list[dict] = [
    # student
    _f("student_name", "Student's full name", "student", core=True),
    _f("dob", "Date of birth", "student", "date", core=True),
    _f("gender", "Gender", "student", "select", ["male", "female", "other"], core=True),
    _f("place_of_birth", "Place of birth", "student"),
    _f("nationality", "Nationality", "student"),
    _f("religion", "Religion", "student", "select",
       ["Hindu", "Muslim", "Christian", "Sikh", "Buddhist", "Jain", "Parsi", "Other", "Prefer not to say"]),
    _f("category", "Social category", "student", "select", ["General", "OBC", "SC", "ST", "EWS"], core=True),
    _f("caste", "Caste", "student"),
    _f("sub_caste", "Sub-caste", "student"),
    _f("mother_tongue", "Mother tongue", "student", "select", LANGUAGES),
    _f("blood_group", "Blood group", "student", "select", ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
    _f("aadhaar_no", "Aadhaar number", "student", "aadhaar"),
    _f("apaar_id", "APAAR ID", "student", "apaar", help="12-digit Automated Permanent Academic Account Registry ID"),
    _f("pen_no", "PEN (UDISE+)", "student", "pen", help="11-digit Permanent Education Number"),
    _f("identification_marks", "Identification marks", "student", "textarea"),
    _f("disability", "Differently abled", "student", "select",
       ["No", "Visual", "Hearing", "Locomotor", "Speech", "Intellectual", "Learning disability", "Autism", "Multiple", "Other"]),
    _f("quota", "Admission quota", "student", "select",
       ["General", "RTE (25%)", "Staff ward", "Sibling", "Management", "Sports", "Other"]),
    # previous schooling
    _f("previous_school", "Previous school", "previous", core=True),
    _f("previous_board", "Board", "previous", "select",
       ["CBSE", "ICSE / ISC", "State Board", "IB", "Cambridge (IGCSE)", "NIOS", "Other", "Not applicable"]),
    _f("previous_class", "Last class studied", "previous"),
    _f("previous_result", "Result (marks / grade)", "previous"),
    _f("previous_medium", "Medium of instruction", "previous", "select", LANGUAGES),
    _f("tc_number", "Transfer certificate number", "previous"),
    _f("tc_date", "Transfer certificate date", "previous", "date"),
    _f("leaving_reason", "Reason for leaving", "previous", "textarea"),
    # parents
    *_parent("father", "Father"),
    *_parent("mother", "Mother"),
    # primary contact
    _f("guardian_name", "Primary contact's name", "contact", core=True),
    _f("guardian_relation", "Relation to the student", "contact", "select",
       ["Father", "Mother", "Guardian", "Grandparent", "Uncle / Aunt", "Other"]),
    _f("phone", "Primary mobile", "contact", "phone", core=True),
    _f("email", "Primary email", "contact", "email", core=True),
    _f("emergency_name", "Emergency contact name", "contact"),
    _f("emergency_phone", "Emergency contact mobile", "contact", "phone"),
    # address
    *_address("comm", "address", "Communication"),
    _f("permanent_same", "Permanent address is the same", "address", "bool"),
    *_address("perm", "address", "Permanent"),
    # other
    _f("second_language", "Second language", "other", "select", LANGUAGES),
    _f("third_language", "Third language", "other", "select", LANGUAGES),
    _f("sibling_in_school", "A brother or sister studies here", "other", "bool", core=True),
    _f("sibling_details", "Sibling's name and class", "other"),
    _f("transport_required", "Needs school transport", "other", "bool", core=True),
    _f("transport_stop", "Pick-up point", "other"),
    _f("boarding", "Day scholar or hostel", "other", "select", ["Day scholar", "Hostel"]),
    # health
    _f("medical_conditions", "Medical conditions", "health", "textarea"),
    _f("allergies", "Allergies", "health", "textarea"),
    _f("family_doctor", "Family doctor", "health"),
    _f("doctor_phone", "Doctor's mobile", "health", "phone"),
    # declaration
    _f("declaration", "I confirm the details given are correct", "declaration", "bool"),
    _f("notes", "Anything else the school should know", "declaration", "textarea", core=True),
]
BY_KEY = {f["key"]: f for f in FIELDS}
CORE = {f["key"] for f in FIELDS if f["core"]}
EXTRA = [f["key"] for f in FIELDS if not f["core"]]
# an application cannot exist without these
ALWAYS = {"student_name", "guardian_name", "phone"}
# what a school asks for until it decides otherwise
DEFAULT_REQUIRED = ALWAYS | {"dob", "gender"}

_PATTERNS = {
    "aadhaar": (r"^\d{12}$", "12 digits"),
    "apaar": (r"^\d{12}$", "12 digits"),
    "pen": (r"^\d{11}$", "11 digits"),
    "pin": (r"^[1-9]\d{5}$", "a 6-digit PIN code"),
    "phone": (r"^(\+91[\s-]?)?[6-9]\d{9}$", "a 10-digit mobile number"),
    "email": (r"^[^@\s]+@[^@\s]+\.[^@\s]+$", "an email address"),
}


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


# ---------- the school's choices ----------


def _rows(db: Session, school_id: int) -> dict[Optional[int], AdmissionFormSetting]:
    return {r.class_id: r for r in db.execute(
        select(AdmissionFormSetting).where(AdmissionFormSetting.school_id == school_id)
    ).scalars()}


def rules(db: Session, school_id: int, class_id: Optional[int]) -> tuple[set[str], set[str]]:
    """(required, hidden) for a class: its own setting, else the school's
    default, else the built-in default."""
    rows = _rows(db, school_id)
    row = rows.get(class_id) if class_id else None
    row = row or rows.get(None)
    if row is None:
        return set(DEFAULT_REQUIRED), set()
    required = (set(row.required or []) | ALWAYS) & set(BY_KEY)
    hidden = (set(row.hidden or []) - ALWAYS - required) & set(BY_KEY)
    return required, hidden


def form(db: Session, school_id: int, class_id: Optional[int]) -> dict:
    """The form as a class sees it: sections, and each field with whether it
    is required, hidden, or always required."""
    required, hidden = rules(db, school_id, class_id)
    return {
        "class_id": class_id,
        "sections": [
            {
                "key": key, "title": title,
                "fields": [
                    {**f, "required": f["key"] in required, "hidden": f["key"] in hidden, "locked": f["key"] in ALWAYS}
                    for f in FIELDS if f["section"] == key
                ],
            }
            for key, title in SECTIONS
        ],
    }


def settings(db: Session, school_id: int) -> dict:
    rows = _rows(db, school_id)
    names = dict(db.execute(
        select(SchoolClass.id, SchoolClass.name).where(SchoolClass.school_id == school_id)
    ).all())
    default = rows.get(None)
    return {
        "fields": FIELDS, "sections": [{"key": k, "title": t} for k, t in SECTIONS],
        "always": sorted(ALWAYS),
        "default": {
            "required": sorted((set(default.required or []) | ALWAYS) if default else DEFAULT_REQUIRED),
            "hidden": sorted(default.hidden or []) if default else [],
            "customised": default is not None,
        },
        "classes": [
            {"class_id": cid, "class_name": names.get(cid, "?"), "required": sorted(set(r.required or []) | ALWAYS),
             "hidden": sorted(r.hidden or [])}
            for cid, r in sorted(rows.items(), key=lambda kv: names.get(kv[0], "")) if cid is not None
        ],
    }


def save_settings(db: Session, user, class_id: Optional[int], required: list[str], hidden: list[str]) -> dict:
    unknown = (set(required) | set(hidden)) - set(BY_KEY)
    if unknown:
        raise _400(f"Unknown fields: {', '.join(sorted(unknown))}")
    both = set(required) & set(hidden)
    if both:
        raise _400(f"A field cannot be both required and hidden: {', '.join(sorted(both))}")
    if set(hidden) & ALWAYS:
        raise _400("Name, primary contact and mobile are always asked for.")
    if class_id is not None:
        c = db.get(SchoolClass, class_id)
        if not c or c.school_id != user.school_id:
            raise _400("Unknown class")
    row = _rows(db, user.school_id).get(class_id)
    if row is None:
        row = AdmissionFormSetting(tenant_id=user.tenant_id, school_id=user.school_id, class_id=class_id)
        db.add(row)
    row.required = sorted(set(required) | ALWAYS)
    row.hidden = sorted(set(hidden))
    db.commit()
    return settings(db, user.school_id)


def clear_class(db: Session, user, class_id: int) -> dict:
    row = _rows(db, user.school_id).get(class_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return settings(db, user.school_id)


# ---------- checking what was filled in ----------


def clean_details(details: Optional[dict]) -> dict:
    """Keep only the form's own extra fields, trimmed; check each one's
    format. Empty values are dropped."""
    out: dict = {}
    for k, v in (details or {}).items():
        f = BY_KEY.get(k)
        if f is None or f["core"]:
            continue  # unknown keys and core fields (which have columns) are ignored here
        if v is None or (isinstance(v, str) and not v.strip()):
            continue
        t = f["type"]
        if t == "bool":
            out[k] = bool(v)
            continue
        v = str(v).strip()
        if t == "date":
            try:
                d = date.fromisoformat(v)
            except ValueError:
                raise _400(f"{f['label']}: not a date")
            if d > date.today():
                raise _400(f"{f['label']}: the date is in the future")
        elif t == "select" and f["options"] and v not in f["options"]:
            raise _400(f"{f['label']}: choose one of the listed options")
        elif t in _PATTERNS:
            compact = re.sub(r"[\s-]", "", v) if t in ("aadhaar", "apaar", "pen", "pin") else v
            pattern, what = _PATTERNS[t]
            if not re.match(pattern, compact):
                raise _400(f"{f['label']}: enter {what}")
            v = compact
        if len(v) > 500:
            raise _400(f"{f['label']}: too long")
        out[k] = v
    if out.get("permanent_same"):
        for part in ("line1", "area", "city", "district", "state", "pin"):
            if f"comm_{part}" in out:
                out[f"perm_{part}"] = out[f"comm_{part}"]
    return out


def missing_required(db: Session, school_id: int, class_id: Optional[int], core: dict, details: dict) -> list[str]:
    """Labels of the required fields left empty, for a class, in form order."""
    required, _ = rules(db, school_id, class_id)
    missing = []
    for f in FIELDS:
        if f["key"] not in required:
            continue
        v = core.get(f["key"]) if f["core"] else details.get(f["key"])
        if f["type"] == "bool":
            # a tick box is "filled" either way, except the declaration, which must be ticked
            if f["key"] == "declaration" and not v:
                missing.append(f["label"])
        elif v is None or (isinstance(v, str) and not v.strip()):
            missing.append(f["label"])
    return missing


def require_complete(db: Session, school_id: int, class_id: Optional[int], core: dict, details: dict) -> None:
    missing = missing_required(db, school_id, class_id, core, details)
    if missing:
        shown = ", ".join(missing[:8]) + (f" and {len(missing) - 8} more" if len(missing) > 8 else "")
        raise _400(f"Still to fill in: {shown}.")


def composed_address(details: dict) -> Optional[str]:
    """The communication address as one line, for the places that show one."""
    parts = [details.get(f"comm_{p}") for p in ("line1", "area", "city", "district", "state")]
    line = ", ".join(p for p in parts if p)
    pin = details.get("comm_pin")
    if pin:
        line = f"{line} - {pin}" if line else pin
    return line or None


# ---------- an admitted student's details ----------

# the student record holds these itself
_ON_STUDENT = {"student_name": "full_name", "dob": "dob", "gender": "gender"}


def _student(db: Session, school_id: int, student_id: int):
    from app.models.student import Student

    s = db.get(Student, student_id)
    if not s or s.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return s


def _profile(db: Session, student):
    from app.models.admission_form import StudentProfile

    return db.execute(select(StudentProfile).where(StudentProfile.student_id == student.id)).scalars().first()


def student_details(db: Session, school_id: int, student_id: int) -> dict:
    """The form for the student's class, and what is on file: the student
    record's own name, birth date and gender, and the profile for the rest."""
    from app.models.academic import Section

    s = _student(db, school_id, student_id)
    sec = db.get(Section, s.section_id) if s.section_id else None
    p = _profile(db, s)
    values = dict(p.details) if p else {}
    for key, col in _ON_STUDENT.items():
        v = getattr(s, col)
        values[key] = v.isoformat() if hasattr(v, "isoformat") else (getattr(v, "value", v))
    if s.blood_group and not values.get("blood_group"):
        values["blood_group"] = s.blood_group
    out = form(db, school_id, sec.class_id if sec else None)
    out["values"] = values
    out["student_id"] = s.id
    out["missing"] = missing_required(db, school_id, out["class_id"], values, values)
    return out


def save_student_details(db: Session, user, student_id: int, details: dict) -> dict:
    """Save the profile. Name, birth date and gender stay with the student
    record (they are changed there); every other field is kept here."""
    from app.models.admission_form import StudentProfile

    s = _student(db, user.school_id, student_id)
    extra = clean_details(details)
    core = {}
    for key in CORE - set(_ON_STUDENT):
        v = details.get(key)
        f = BY_KEY[key]
        if f["type"] == "bool":
            core[key] = bool(v)
        elif v not in (None, ""):
            v = str(v).strip()
            if f["type"] in _PATTERNS and not re.match(_PATTERNS[f["type"]][0], v):
                raise _400(f"{f['label']}: enter {_PATTERNS[f['type']][1]}")
            if f["type"] == "select" and f["options"] and v not in f["options"]:
                raise _400(f"{f['label']}: choose one of the listed options")
            core[key] = v[:2000]
    p = _profile(db, s)
    if p is None:
        p = StudentProfile(tenant_id=s.tenant_id, school_id=s.school_id, student_id=s.id, details={})
        db.add(p)
    p.details = {**extra, **core}
    if extra.get("blood_group"):
        s.blood_group = extra["blood_group"]
    addr = composed_address(extra)
    if addr:
        s.address = addr
    db.commit()
    return student_details(db, user.school_id, student_id)
