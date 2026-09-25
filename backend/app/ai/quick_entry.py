"""Smart entry: a teacher describes the day in plain words ("Ravi and Priya
absent, Arun came late. Maths homework: exercise 5.2, due Friday") and an agent
turns it into draft attendance + homework records.

The agent only has read-only tools scoped to the teacher. Its output is a
proposal; the teacher reviews it and saves through the normal endpoints, which
re-check every permission.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.client import AIUnavailable, create, obj, text_of
from app.models.academic import SchoolClass, Section
from app.models.homework import Homework
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.tenant import School

MAX_TURNS = 6

SYSTEM = """You are the data-entry assistant inside a school management system.
A teacher writes what happened in class in their own words, possibly mixing
languages, abbreviations or nicknames. Turn it into draft records:

* Daily attendance - only for sections listed under "Class teacher of". Put
  every student the teacher calls absent, late or half-day in `entries`, with
  a short remark if the teacher gave a reason. Set mark_others_present to true
  when the teacher is reporting the whole day's attendance (e.g. "rest
  present", "only X absent", "X and Y absent today"); false if they are only
  correcting individual students.
* Homework - one item per assignment, for a subject listed under "Subjects
  you teach". Write a clear title and a description a parent can follow.
  Resolve relative due dates ("tomorrow", "Friday", "next Monday") against
  today's date; a due date can't be in the past. If no due date is given,
  use the next school day.

Always look up the roster with get_section_roster before choosing student
ids, and match names to the roster yourself (spelling variants, first names,
initials, roll numbers). Never invent a student id. If a name matches no one,
or matches several students equally well, leave it out and add it to
`unmatched`. Call get_recent_homework before creating homework so you don't
duplicate an assignment that already exists. Put anything you need the
teacher to clarify in `questions`. Leave out any part the teacher didn't
mention: set attendance.include to false and/or return an empty homework
list."""

TOOLS = [
    {
        "name": "get_section_roster",
        "description": (
            "List the active students of a section: student_id, roll number, "
            "full name and admission number. Use it to match the names the "
            "teacher wrote to real student ids."
        ),
        "strict": True,
        "input_schema": obj({"section_id": {"type": "integer"}}),
    },
    {
        "name": "get_recent_homework",
        "description": (
            "List homework already set for a class-subject in the last 14 days "
            "(title, due date), to avoid creating duplicates."
        ),
        "strict": True,
        "input_schema": obj({"class_subject_id": {"type": "integer"}}),
    },
]

OUTPUT_SCHEMA = obj(
    {
        "summary": {"type": "string"},
        "attendance": obj(
            {
                "include": {"type": "boolean"},
                "section_id": {"type": "integer"},
                "date": {"type": "string"},
                "entries": {
                    "type": "array",
                    "items": obj(
                        {
                            "student_id": {"type": "integer"},
                            "status": {"type": "string", "enum": ["absent", "late", "half_day"]},
                            "remark": {"type": "string"},
                        }
                    ),
                },
                "mark_others_present": {"type": "boolean"},
            }
        ),
        "homework": {
            "type": "array",
            "items": obj(
                {
                    "class_subject_id": {"type": "integer"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "due_date": {"type": "string"},
                }
            ),
        },
        "unmatched": {"type": "array", "items": {"type": "string"}},
        "questions": {"type": "array", "items": {"type": "string"}},
    }
)


class _Scope:
    """What this teacher may touch, loaded once per request."""

    def __init__(self, db: Session, teacher_id: int, school_id: int):
        self.db = db
        self.sections: dict[int, str] = {
            sec.id: f"{cls.name} {sec.name}"
            for sec, cls in db.execute(
                select(Section, SchoolClass)
                .join(SchoolClass, Section.class_id == SchoolClass.id)
                .where(
                    Section.school_id == school_id,
                    Section.class_teacher_user_id == teacher_id,
                )
            ).all()
        }
        self.subjects: dict[int, dict] = {}
        for cs, subj, cls in db.execute(
            select(ClassSubject, Subject, SchoolClass)
            .join(Subject, ClassSubject.subject_id == Subject.id)
            .join(SchoolClass, ClassSubject.class_id == SchoolClass.id)
            .where(
                ClassSubject.school_id == school_id,
                ClassSubject.teacher_user_id == teacher_id,
            )
        ).all():
            self.subjects[cs.id] = {
                "class_subject_id": cs.id,
                "subject": subj.name,
                "class": cls.name,
                "class_id": cls.id,
            }
        # Rosters of sections the teacher can see (class-teacher sections and
        # sections of classes they teach).
        class_ids = {s["class_id"] for s in self.subjects.values()}
        visible = set(self.sections)
        if class_ids:
            visible |= set(
                db.execute(select(Section.id).where(Section.class_id.in_(class_ids))).scalars()
            )
        self.visible_sections = visible
        self._rosters: dict[int, dict[int, Student]] = {}

    def roster(self, section_id: int) -> dict[int, Student]:
        if section_id not in self._rosters:
            self._rosters[section_id] = {
                s.id: s
                for s in self.db.execute(
                    select(Student)
                    .where(Student.section_id == section_id, Student.is_active.is_(True))
                    .order_by(Student.roll_no, Student.full_name)
                ).scalars()
            }
        return self._rosters[section_id]

    def run_tool(self, name: str, args: dict) -> tuple[str, bool]:
        if name == "get_section_roster":
            sid = args.get("section_id")
            if sid not in self.visible_sections:
                return "You don't have access to that section.", True
            rows = [
                {"student_id": s.id, "roll_no": s.roll_no, "name": s.full_name, "admission_no": s.admission_no}
                for s in self.roster(sid).values()
            ]
            return json.dumps(rows), False
        if name == "get_recent_homework":
            csid = args.get("class_subject_id")
            if csid not in self.subjects:
                return "You don't teach that class-subject.", True
            since = date.today().toordinal() - 14
            rows = [
                {"title": h.title, "due_date": h.due_date.isoformat()}
                for h in self.db.execute(
                    select(Homework)
                    .where(Homework.class_subject_id == csid)
                    .order_by(Homework.due_date.desc())
                    .limit(20)
                ).scalars()
                if h.created_at.date().toordinal() >= since
            ]
            return json.dumps(rows), False
        return f"Unknown tool {name}", True


def _context(scope: _Scope, today: date, section_hint: int | None) -> str:
    lines = [f"Today: {today:%A} {today.isoformat()}", "", "Class teacher of:"]
    lines += [f"- section_id {sid}: {label}" for sid, label in scope.sections.items()] or ["- (none)"]
    lines += ["", "Subjects you teach:"]
    lines += [
        f"- class_subject_id {s['class_subject_id']}: {s['subject']} for {s['class']}"
        for s in scope.subjects.values()
    ] or ["- (none)"]
    if section_hint and section_hint in scope.visible_sections:
        lines += ["", f"The teacher currently has section_id {section_hint} selected."]
    return "\n".join(lines)


def _validate(scope: _Scope, draft: dict, today: date) -> dict:
    """Never trust ids or dates from the model: drop anything out of scope."""
    notes: list[str] = []
    att = draft["attendance"]
    if att["include"]:
        sid = att["section_id"]
        try:
            on = date.fromisoformat(att["date"]) if att["date"] else today
        except ValueError:
            on = today
        if sid not in scope.sections:
            notes.append("Attendance skipped: you are not the class teacher of that section.")
            att = {**att, "include": False, "entries": []}
        else:
            roster = scope.roster(sid)
            seen: set[int] = set()
            entries = []
            for e in att["entries"]:
                if e["student_id"] in roster and e["student_id"] not in seen:
                    seen.add(e["student_id"])
                    entries.append({**e, "student_name": roster[e["student_id"]].full_name})
            att = {
                **att,
                "date": on.isoformat(),
                "section_label": scope.sections[sid],
                "entries": entries,
                "roster_size": len(roster),
            }
    homework = []
    for h in draft["homework"]:
        cs = scope.subjects.get(h["class_subject_id"])
        if not cs:
            notes.append(f"Homework '{h['title']}' skipped: subject not assigned to you.")
            continue
        try:
            due = date.fromisoformat(h["due_date"])
        except ValueError:
            due = today
        if due < today:
            due = today
        homework.append({**h, "due_date": due.isoformat(), "subject": cs["subject"], "class": cs["class"]})
    return {
        "summary": draft["summary"],
        "attendance": att,
        "homework": homework,
        "unmatched": draft["unmatched"],
        "questions": draft["questions"] + notes,
    }


def propose(
    db: Session,
    *,
    teacher_id: int,
    school_id: int,
    text: str,
    section_hint: int | None = None,
) -> dict:
    scope = _Scope(db, teacher_id, school_id)
    if not scope.sections and not scope.subjects:
        raise AIUnavailable("You have no class or subject assignments yet.")
    school = db.get(School, school_id)
    today = datetime.now(ZoneInfo(school.timezone if school else "Asia/Kolkata")).date()

    messages: list = [
        {
            "role": "user",
            "content": f"{_context(scope, today, section_hint)}\n\nTeacher's message:\n{text}",
        }
    ]
    for _ in range(MAX_TURNS):
        response = create(
            max_tokens=16000,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
            output_config={
                "effort": "medium",
                "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
            },
        )
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        if response.stop_reason != "tool_use" or not tool_uses:
            try:
                draft = json.loads(text_of(response))
            except json.JSONDecodeError:
                raise AIUnavailable("The AI returned an unreadable answer. Please retry.")
            return _validate(scope, draft, today)
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for tu in tool_uses:
            out, is_error = scope.run_tool(tu.name, tu.input)
            results.append(
                {"type": "tool_result", "tool_use_id": tu.id, "content": out, "is_error": is_error}
            )
        messages.append({"role": "user", "content": results})
    raise AIUnavailable("The AI took too many steps. Try a shorter message.")
