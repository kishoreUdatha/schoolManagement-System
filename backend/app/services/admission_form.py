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

Schools follow different boards, so the school names its board and starts
from that board's usual choices (PRESETS), then changes what it likes. A
child who is not an Indian national is also asked for passport and visa;
an address outside India drops the Indian state and PIN rules. And a school
can add questions of its own (AdmissionCustomField), which behave like the
built-in ones: required, optional or not asked, per class.
"""
import re
from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.admission_form import AdmissionCustomField, AdmissionFormSetting
from app.models.academic import SchoolClass

STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep",
    "Puducherry", "Outside India",
]
ABROAD = "Outside India"
INCOME = ["Below ₹1 lakh", "₹1–3 lakh", "₹3–5 lakh", "₹5–10 lakh", "₹10–25 lakh", "Above ₹25 lakh"]
LANGUAGES = [
    # the Eighth Schedule
    "English", "Hindi", "Assamese", "Bengali", "Bodo", "Dogri", "Gujarati", "Kannada", "Kashmiri", "Konkani",
    "Maithili", "Malayalam", "Manipuri", "Marathi", "Nepali", "Odia", "Punjabi", "Sanskrit", "Santali", "Sindhi",
    "Tamil", "Telugu", "Urdu",
    # taught as foreign languages, or spoken at home by international families
    "Arabic", "Chinese (Mandarin)", "French", "German", "Italian", "Japanese", "Korean", "Persian", "Portuguese",
    "Russian", "Spanish", "Other",
]
BOARDS = ["CBSE", "ICSE / ISC", "State Board", "IB", "Cambridge (IGCSE)", "Cambridge (AS / A Level)", "NIOS",
          "American curriculum", "Other overseas board", "Other", "Not applicable"]

SECTIONS = [
    ("student", "Student details"),
    ("international", "Passport and visa"),
    ("previous", "Previous schooling"),
    ("father", "Father"),
    ("mother", "Mother"),
    ("contact", "Primary contact"),
    ("address", "Address"),
    ("other", "Languages, siblings and transport"),
    ("health", "Health"),
    ("additional", "Additional information"),
    ("declaration", "Declaration"),
]


def _f(key, label, section, type_="text", options=None, core=False, help=None, when=None, future=False):
    """A field. `when` asks it only sometimes: "foreign" for a child who is
    not an Indian national, "comm_abroad" / "perm_abroad" for an address
    outside India. `future` lets a date be ahead of today (a passport's expiry)."""
    return {"key": key, "label": label, "section": section, "type": type_, "options": options,
            "core": core, "help": help, "when": when, "future": future, "custom": False}


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
        _f(f"{prefix}_country", f"{what}: country", section, when=f"{prefix}_abroad"),
        _f(f"{prefix}_pin", f"{what}: PIN / postal code", section, "pin"),
    ]


FIELDS: list[dict] = [
    # student
    _f("student_name", "Student's full name", "student", core=True),
    _f("dob", "Date of birth", "student", "date", core=True),
    _f("gender", "Gender", "student", "select", ["male", "female", "other"], core=True),
    _f("place_of_birth", "Place of birth", "student"),
    _f("nationality", "Nationality", "student", help="Passport and visa are asked for a child who is not Indian"),
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
    # a child who is not an Indian national
    _f("passport_no", "Passport number", "international", when="foreign"),
    _f("passport_country", "Passport issued by (country)", "international", when="foreign"),
    _f("passport_expiry", "Passport valid until", "international", "date", when="foreign", future=True),
    _f("visa_type", "Visa or OCI", "international", "select",
       ["OCI card holder", "Student visa", "Dependent / family visa", "Employment visa", "Diplomatic", "Other"],
       when="foreign"),
    _f("visa_no", "Visa / OCI card number", "international", when="foreign"),
    _f("visa_expiry", "Visa valid until", "international", "date", when="foreign", future=True,
       help="Leave empty for an OCI card, which does not expire"),
    _f("frro_no", "FRRO registration number", "international", when="foreign",
       help="Residential permit, for a stay of more than 180 days"),
    # previous schooling
    _f("previous_school", "Previous school", "previous", core=True),
    _f("previous_board", "Board", "previous", "select", BOARDS),
    _f("previous_class", "Last class studied", "previous"),
    _f("previous_result", "Result (marks / grade)", "previous"),
    _f("previous_medium", "Medium of instruction", "previous", "select", LANGUAGES),
    _f("tc_number", "Transfer certificate number", "previous"),
    _f("tc_date", "Transfer certificate date", "previous", "date"),
    _f("leaving_reason", "Reason for leaving", "previous", "textarea"),
    _f("board_reg_no", "Board registration number", "previous", help="Class 10 or 12 board registration, for admission to Class 11"),
    _f("board_roll_no", "Board exam roll number", "previous"),
    _f("board_exam_year", "Year of passing the board exam", "previous", "year"),
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

# Where each board's school usually starts. Fields asked only sometimes
# (passport for a foreign national) are required only when they are asked.
_COMMON = DEFAULT_REQUIRED | {"nationality", "father_name", "mother_name", "emergency_phone",
                              "comm_line1", "comm_city", "comm_state", "comm_pin", "declaration"}
_INDIA = {"category", "aadhaar_no", "apaar_id", "mother_tongue", "religion"}
_PASSPORT = {"passport_no", "passport_country", "passport_expiry", "visa_type"}
PRESETS = {
    "cbse": ("CBSE", _COMMON | _INDIA | _PASSPORT | {"pen_no", "second_language"}, set()),
    "icse": ("ICSE / ISC", _COMMON | _INDIA | _PASSPORT | {"second_language"}, set()),
    "state": ("State Board", _COMMON | _INDIA | _PASSPORT | {"pen_no", "caste", "place_of_birth"}, set()),
    "nios": ("NIOS", DEFAULT_REQUIRED | _PASSPORT | {"nationality", "category", "aadhaar_no", "comm_line1",
                                                     "comm_city", "comm_state", "comm_pin", "declaration"},
             {"boarding", "transport_stop"}),
    "ib": ("IB", _COMMON | _PASSPORT | {"previous_board", "previous_class", "visa_expiry"},
           {"caste", "sub_caste", "quota"}),
    "cambridge": ("Cambridge", _COMMON | _PASSPORT | {"previous_board", "previous_class", "visa_expiry"},
                  {"caste", "sub_caste", "quota"}),
}
CUSTOM_TYPES = {"text", "textarea", "date", "select", "bool", "phone", "email"}
MAX_CUSTOM = 40

_PATTERNS = {
    "aadhaar": (r"^\d{12}$", "12 digits"),
    "apaar": (r"^\d{12}$", "12 digits"),
    "pen": (r"^\d{11}$", "11 digits"),
    "pin": (r"^[1-9]\d{5}$", "a 6-digit PIN code"),
    # an Indian mobile, or an overseas number written with its country code
    "phone": (r"^((\+91[\s-]?)?[6-9]\d{9}|\+(?!91)\d{1,3}[\s-]?\d[\d\s-]{5,14})$",
              "a 10-digit mobile number (or +country code and number)"),
    "year": (r"^(19|20)\d{2}$", "a year, like 2024"),
    "email": (r"^[^@\s]+@[^@\s]+\.[^@\s]+$", "an email address"),
}


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


# ---------- the school's fields: the built-in ones and its own ----------


def _custom_rows(db: Session, school_id: int, include_removed: bool = False) -> list[AdmissionCustomField]:
    q = select(AdmissionCustomField).where(AdmissionCustomField.school_id == school_id)
    if not include_removed:
        q = q.where(AdmissionCustomField.active.is_(True))
    return list(db.execute(q.order_by(AdmissionCustomField.position, AdmissionCustomField.id)).scalars())


def _custom_field(c: AdmissionCustomField) -> dict:
    return {**_f(c.key, c.label, c.section, c.type, c.options or None, help=c.help, future=True),
            "custom": True, "id": c.id, "active": c.active}


def catalog(db: Session, school_id: int, include_removed: bool = False) -> tuple[list[dict], dict[str, dict]]:
    """Every field this school's form has, in form order, and by key. A
    removed question still counts when reading what was filled in, so old
    answers are kept, but it is no longer asked."""
    custom = [_custom_field(c) for c in _custom_rows(db, school_id, include_removed)]
    fields = []
    for key, _ in SECTIONS:
        fields += [f for f in FIELDS if f["section"] == key]
        fields += [f for f in custom if f["section"] == key]
    return fields, {f["key"]: f for f in fields}


def is_foreign(values: dict) -> bool:
    """A nationality typed and not Indian."""
    n = re.sub(r"[^a-z]", "", str(values.get("nationality") or "").lower())
    return bool(n) and n not in ("indian", "india", "bharatiya", "bhartiya")


def asked(f: dict, values: dict) -> bool:
    """Whether a field is asked, given what is filled in so far."""
    when = f.get("when")
    if when == "foreign":
        return is_foreign(values)
    if when in ("comm_abroad", "perm_abroad"):
        return values.get(f"{when[:4]}_state") == ABROAD
    if f["key"].startswith("perm_") and values.get("permanent_same"):
        return False
    return True


# ---------- the school's choices ----------


def _rows(db: Session, school_id: int) -> dict[Optional[int], AdmissionFormSetting]:
    return {r.class_id: r for r in db.execute(
        select(AdmissionFormSetting).where(AdmissionFormSetting.school_id == school_id)
    ).scalars()}


def rules(db: Session, school_id: int, class_id: Optional[int], by_key: Optional[dict] = None) -> tuple[set[str], set[str]]:
    """(required, hidden) for a class: its own setting, else the school's
    default, else the built-in default."""
    if by_key is None:
        by_key = catalog(db, school_id)[1]
    rows = _rows(db, school_id)
    row = rows.get(class_id) if class_id else None
    row = row or rows.get(None)
    if row is None:
        return set(DEFAULT_REQUIRED), set()
    required = (set(row.required or []) | ALWAYS) & set(by_key)
    hidden = (set(row.hidden or []) - ALWAYS - required) & set(by_key)
    return required, hidden


def _sections(fields: list[dict]) -> list[tuple[str, str]]:
    """The sections that have a field (Additional information only once the
    school adds a question to it)."""
    used = {f["section"] for f in fields}
    return [(k, t) for k, t in SECTIONS if k in used]


def form(db: Session, school_id: int, class_id: Optional[int]) -> dict:
    """The form as a class sees it: sections, and each field with whether it
    is required, hidden, or always required."""
    fields, by_key = catalog(db, school_id)
    required, hidden = rules(db, school_id, class_id, by_key)
    return {
        "class_id": class_id,
        "sections": [
            {
                "key": key, "title": title,
                "fields": [
                    {**f, "required": f["key"] in required, "hidden": f["key"] in hidden, "locked": f["key"] in ALWAYS}
                    for f in fields if f["section"] == key
                ],
            }
            for key, title in _sections(fields)
        ],
    }


def settings(db: Session, school_id: int) -> dict:
    fields, by_key = catalog(db, school_id)
    rows = _rows(db, school_id)
    names = dict(db.execute(
        select(SchoolClass.id, SchoolClass.name).where(SchoolClass.school_id == school_id)
    ).all())
    default = rows.get(None)
    keys = set(by_key)
    return {
        "fields": fields, "sections": [{"key": k, "title": t} for k, t in _sections(fields)],
        "all_sections": [{"key": k, "title": t} for k, t in SECTIONS],
        "always": sorted(ALWAYS),
        "board": default.board if default else None,
        "presets": [
            {"key": k, "name": name, "required": sorted((req | ALWAYS) & keys), "hidden": sorted(hid & keys)}
            for k, (name, req, hid) in PRESETS.items()
        ],
        "default": {
            "required": sorted(((set(default.required or []) | ALWAYS) if default else DEFAULT_REQUIRED) & keys),
            "hidden": sorted(set(default.hidden or []) & keys) if default else [],
            "customised": default is not None,
        },
        "classes": [
            {"class_id": cid, "class_name": names.get(cid, "?"),
             "required": sorted((set(r.required or []) | ALWAYS) & keys), "hidden": sorted(set(r.hidden or []) & keys)}
            for cid, r in sorted(rows.items(), key=lambda kv: names.get(kv[0], "")) if cid is not None
        ],
        "custom": [_custom_field(c) for c in _custom_rows(db, school_id)],
        "max_custom": MAX_CUSTOM,
    }


def save_settings(db: Session, user, class_id: Optional[int], required: list[str], hidden: list[str],
                  board: Optional[str] = None) -> dict:
    _, by_key = catalog(db, user.school_id)
    unknown = (set(required) | set(hidden)) - set(by_key)
    if unknown:
        raise _400(f"Unknown fields: {', '.join(sorted(unknown))}")
    both = set(required) & set(hidden)
    if both:
        raise _400(f"A field cannot be both required and hidden: {', '.join(sorted(both))}")
    if set(hidden) & ALWAYS:
        raise _400("Name, primary contact and mobile are always asked for.")
    if board is not None and board not in PRESETS:
        raise _400("Unknown board")
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
    if class_id is None and board is not None:
        # the board belongs to the school, so it lives on the default
        row.board = board
    db.commit()
    return settings(db, user.school_id)


def clear_class(db: Session, user, class_id: int) -> dict:
    row = _rows(db, user.school_id).get(class_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return settings(db, user.school_id)


# ---------- the school's own questions ----------


def _clean_question(label: str, section: str, type_: str, options: Optional[list], help: Optional[str]) -> dict:
    label = (label or "").strip()
    if not label:
        raise _400("Give the question a label.")
    if len(label) > 120:
        raise _400("Keep the label under 120 characters.")
    if section not in {k for k, _ in SECTIONS}:
        raise _400("Unknown section")
    if type_ not in CUSTOM_TYPES:
        raise _400("Unknown answer type")
    opts = None
    if type_ == "select":
        opts = list(dict.fromkeys(str(o).strip()[:80] for o in (options or []) if str(o).strip()))
        if len(opts) < 2:
            raise _400("A choice question needs at least two options.")
        if len(opts) > 50:
            raise _400("Keep it to 50 options.")
    help = (help or "").strip()[:200] or None
    return {"label": label, "section": section, "type": type_, "options": opts, "help": help}


def add_question(db: Session, user, label: str, section: str, type_: str, options: Optional[list],
                 help: Optional[str]) -> dict:
    q = _clean_question(label, section, type_, options, help)
    live = _custom_rows(db, user.school_id)
    if len(live) >= MAX_CUSTOM:
        raise _400(f"A school can have up to {MAX_CUSTOM} questions of its own.")
    if any(c.label.lower() == q["label"].lower() for c in live) or q["label"].lower() in {f["label"].lower() for f in FIELDS}:
        raise _400("The form already asks that.")
    c = AdmissionCustomField(tenant_id=user.tenant_id, school_id=user.school_id, key="pending",
                             position=max((x.position for x in live), default=0) + 1, active=True, **q)
    db.add(c)
    db.flush()
    c.key = f"custom_{c.id}"
    db.commit()
    return settings(db, user.school_id)


def _question(db: Session, school_id: int, field_id: int) -> AdmissionCustomField:
    c = db.get(AdmissionCustomField, field_id)
    if not c or c.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    return c


def edit_question(db: Session, user, field_id: int, label: str, section: str, options: Optional[list],
                  help: Optional[str]) -> dict:
    """Label, section, options and help can change; the answer type cannot,
    since answers already given are of that type."""
    c = _question(db, user.school_id, field_id)
    q = _clean_question(label, section, c.type, options, help)
    if any(x.id != c.id and x.label.lower() == q["label"].lower() for x in _custom_rows(db, user.school_id)):
        raise _400("The form already asks that.")
    c.label, c.section, c.options, c.help = q["label"], q["section"], q["options"], q["help"]
    db.commit()
    return settings(db, user.school_id)


def remove_question(db: Session, user, field_id: int) -> dict:
    """No longer asked. Answers already given stay on the applications and
    student profiles that have them."""
    c = _question(db, user.school_id, field_id)
    c.active = False
    db.commit()
    return settings(db, user.school_id)


# ---------- checking what was filled in ----------


def clean_details(db: Session, school_id: int, details: Optional[dict]) -> dict:
    """Keep only the form's own extra fields, trimmed; check each one's
    format. Empty values are dropped."""
    _, by_key = catalog(db, school_id, include_removed=True)
    details = details or {}
    out: dict = {}
    for k, v in details.items():
        f = by_key.get(k)
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
            if d > date.today() and not f.get("future"):
                raise _400(f"{f['label']}: the date is in the future")
        elif t == "select" and f["options"] and v not in f["options"]:
            raise _400(f"{f['label']}: choose one of the listed options")
        elif t == "pin" and details.get(f"{k[:4]}_state") == ABROAD:
            # an overseas postal code: letters, digits, spaces and dashes
            if not re.match(r"^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$", v):
                raise _400(f"{f['label']}: enter the postal code")
        elif t in _PATTERNS:
            compact = re.sub(r"[\s-]", "", v) if t in ("aadhaar", "apaar", "pen", "pin") else v
            pattern, what = _PATTERNS[t]
            if not re.match(pattern, compact):
                raise _400(f"{f['label']}: enter {what}")
            if t == "year" and int(compact) > date.today().year:
                raise _400(f"{f['label']}: the year is in the future")
            v = compact
        if len(v) > 500:
            raise _400(f"{f['label']}: too long")
        out[k] = v
    if out.get("permanent_same"):
        for part in ("line1", "area", "city", "district", "state", "country", "pin"):
            out.pop(f"perm_{part}", None)
            if f"comm_{part}" in out:
                out[f"perm_{part}"] = out[f"comm_{part}"]
    return out


def missing_required(db: Session, school_id: int, class_id: Optional[int], core: dict, details: dict) -> list[str]:
    """Labels of the required fields left empty, for a class, in form order.
    A field not asked (passport for an Indian child) is never missing."""
    fields, by_key = catalog(db, school_id)
    required, _ = rules(db, school_id, class_id, by_key)
    values = {**details, **{k: v for k, v in core.items() if v is not None}}
    missing = []
    for f in fields:
        if f["key"] not in required or not asked(f, values):
            continue
        v = values.get(f["key"])
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
    abroad = details.get("comm_state") == ABROAD
    parts = [details.get(f"comm_{p}") for p in ("line1", "area", "city", "district")]
    parts.append(details.get("comm_country") if abroad else details.get("comm_state"))
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
    extra = clean_details(db, user.school_id, details)
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
