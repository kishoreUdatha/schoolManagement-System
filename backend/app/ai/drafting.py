"""Single-call AI helpers: behaviour ratings, parent summaries, notice drafts,
and student-list extraction from pasted text / photos / PDFs."""
from __future__ import annotations

import base64
from datetime import date

from app.ai.client import AIUnavailable, json_call, obj

_RATING = {"type": "integer", "enum": [1, 2, 3, 4, 5]}


# --- Behaviour ---------------------------------------------------------------

BEHAVIOUR_SYSTEM = """You help a class teacher turn a short note about a student into
behaviour ratings on a 1-5 scale (1 = serious concern, 3 = typical, 5 = exemplary)
for four dimensions: punctuality, participation, discipline, respect.
Rate each dimension independently from what the note says. When the note says
nothing about a dimension, give 3. Keep the rationale to one or two plain
sentences a teacher can check quickly, naming the evidence for any rating
other than 3."""


def suggest_behaviour(note: str) -> dict:
    data = json_call(
        system=BEHAVIOUR_SYSTEM,
        content=f"Teacher's note:\n{note}",
        schema=obj(
            {
                "punctuality": _RATING,
                "participation": _RATING,
                "discipline": _RATING,
                "respect": _RATING,
                "rationale": {"type": "string"},
            }
        ),
        max_tokens=2000,
    )
    return {**data, "source": "claude"}


# --- Weekly report summary for parents --------------------------------------

SUMMARY_SYSTEM = """You write the short weekly note a school sends to a parent about
their child. Use only the figures provided; never invent events, marks or
behaviour. Write 3-5 warm, plain-language sentences a busy parent can read in
20 seconds: what went well, anything to keep an eye on, and one concrete way
the parent can help at home when something needs attention. Address the parent
("your child" or the child's first name). No headings, no bullet points, no
greeting or sign-off. If a figure is missing, don't mention that area."""


def weekly_summary(report: dict) -> str:
    lines = [
        f"Student: {report['student_name']}",
        f"Week: {report['week_start']} to {report['week_end']}",
    ]
    if report["attendance_marked"]:
        lines.append(
            f"Attendance: present {report['attendance_present']}, absent "
            f"{report['attendance_absent']}, late {report['attendance_late']}, "
            f"half day {report['attendance_half_day']} of "
            f"{report['attendance_marked']} days ({report['attendance_pct']}%)"
        )
    if report["homework_total"]:
        lines.append(
            f"Homework: submitted {report['homework_submitted']} of "
            f"{report['homework_total']} ({report['homework_submission_pct']}%)"
        )
    ms = report.get("marks_summary") or {}
    if ms.get("papers"):
        lines.append(
            f"Test papers this week: {ms['papers']}, average {ms.get('avg_pct')}%, "
            f"passed {ms.get('pass_rate_pct')}%"
        )
    if report.get("behaviour_avg") is not None:
        lines.append(f"Behaviour rating average: {report['behaviour_avg']} out of 5")
    if report.get("teacher_remark"):
        lines.append(f"Teacher's remark: {report['teacher_remark']}")

    data = json_call(
        system=SUMMARY_SYSTEM,
        content="\n".join(lines),
        schema=obj({"summary": {"type": "string"}}),
        max_tokens=2000,
    )
    return data["summary"].strip()


# --- Notice drafting --------------------------------------------------------

NOTICE_SYSTEM = """You draft notices that a school sends to parents or staff.
Turn the admin's brief into a clear notice: a short specific title (under 80
characters) and a body of a few short paragraphs. Keep every fact from the
brief (dates, times, amounts, places) exactly as given and do not add facts
that are not in the brief. Put the action the reader must take, and its
deadline, near the top. Plain language, polite, no emojis. Write in the
language the brief is written in unless the brief asks for another."""


def draft_notice(brief: str, school_name: str, today: date) -> dict:
    return json_call(
        system=NOTICE_SYSTEM,
        content=f"School: {school_name}\nToday: {today:%A %d %B %Y}\n\nBrief:\n{brief}",
        schema=obj({"title": {"type": "string"}, "body": {"type": "string"}}),
        effort="medium",
        max_tokens=4000,
    )


# --- Student list extraction ------------------------------------------------

EXTRACT_SYSTEM = """You extract student admission records from whatever the school
provides: a pasted list, CSV/Excel text, a photo of an admission register, or
a PDF of forms. Return one row per student.
* full_name: as written, in normal capitalisation.
* dob: ISO date YYYY-MM-DD, or "" if absent or ambiguous. Dates in Indian
  documents are usually day/month/year.
* gender: "male", "female", "other" or "" when not stated. Do not guess from
  the name.
* blood_group: e.g. "B+", or "".
* address: single line, or "".
* guardian_name, guardian_phone: if present, else "".
Skip header rows, totals and blank lines. Put anything you could not read or
had to guess in `warnings`, naming the row."""

_EXTRACT_SCHEMA = obj(
    {
        "students": {
            "type": "array",
            "items": obj(
                {
                    "full_name": {"type": "string"},
                    "dob": {"type": "string"},
                    "gender": {"type": "string", "enum": ["male", "female", "other", ""]},
                    "blood_group": {"type": "string"},
                    "address": {"type": "string"},
                    "guardian_name": {"type": "string"},
                    "guardian_phone": {"type": "string"},
                }
            ),
        },
        "warnings": {"type": "array", "items": {"type": "string"}},
    }
)

IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


def extract_students(
    *, text: str | None, file_bytes: bytes | None, media_type: str | None
) -> dict:
    content: list = []
    if file_bytes:
        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise AIUnavailable("File is too large (max 15 MB).")
        data = base64.standard_b64encode(file_bytes).decode()
        if media_type in IMAGE_TYPES:
            content.append(
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}}
            )
        elif media_type == "application/pdf":
            content.append(
                {"type": "document", "source": {"type": "base64", "media_type": media_type, "data": data}}
            )
        else:
            # CSV / plain text uploads
            text = (text or "") + "\n" + file_bytes.decode("utf-8", errors="replace")
    if text and text.strip():
        content.append({"type": "text", "text": f"Source text:\n{text.strip()}"})
    if not content:
        raise AIUnavailable("Paste some text or attach a file.")
    content.append({"type": "text", "text": "Extract the student records."})

    data = json_call(
        system=EXTRACT_SYSTEM,
        content=content,
        schema=_EXTRACT_SCHEMA,
        effort="medium",
        max_tokens=32000,
    )
    # Normalise dates Claude could not make ISO.
    for row in data["students"]:
        try:
            if row["dob"]:
                date.fromisoformat(row["dob"])
        except ValueError:
            data["warnings"].append(f"{row['full_name']}: unreadable date '{row['dob']}'")
            row["dob"] = ""
    return data
