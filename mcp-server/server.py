"""MCP server for the School Management System.

Lets an MCP client (Claude Desktop, Claude Code, n8n's MCP node, ...) work with
the school ERP in plain language: "mark Ravi and Priya absent in Grade 2 A
today", "what homework did I set this week", "draft a notice about Friday's
PTM". Every tool calls the backend REST API as the configured user, so the
backend's permission checks apply unchanged: a teacher login can only touch
that teacher's sections.

Configuration (environment variables):
    SMS_API_URL    backend base URL, default http://127.0.0.1:8000
    SMS_PORTAL     school | principal | teacher | parent   (login portal)
    SMS_EMAIL      login email
    SMS_PASSWORD   login password
    MCP_TRANSPORT  stdio (default) or streamable-http
"""
from __future__ import annotations

import os
from datetime import date
from typing import Any, Literal

import httpx2 as httpx
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

API = os.environ.get("SMS_API_URL", "http://127.0.0.1:8000").rstrip("/")
PORTAL = os.environ.get("SMS_PORTAL", "teacher")

READ = ToolAnnotations(read_only_hint=True, open_world_hint=False)
WRITE = ToolAnnotations(read_only_hint=False, destructive_hint=False, open_world_hint=False)

server = MCPServer(
    name="school-erp",
    instructions=(
        "Tools for a school management system. Read tools are safe. Tools that "
        "save data (save_attendance, create_homework, add_knowledge_document) "
        "change real school records: show the user what you are about to save "
        "and get their confirmation first. Prefer draft_from_note to turn a "
        "teacher's free-text note into attendance/homework drafts."
    ),
)


class _Session:
    token: str | None = None
    me: dict | None = None


def _login(client: httpx.Client) -> None:
    email, password = os.environ.get("SMS_EMAIL"), os.environ.get("SMS_PASSWORD")
    if not email or not password:
        raise ToolError("Set SMS_EMAIL and SMS_PASSWORD for the MCP server")
    r = client.post(f"{API}/api/v1/{PORTAL}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        raise ToolError(f"Login failed ({r.status_code}): {r.text[:200]}")
    body = r.json()
    _Session.token, _Session.me = body["access_token"], body["user"]


def _call(method: str, path: str, **kw: Any) -> Any:
    with httpx.Client(timeout=120) as client:
        if not _Session.token:
            _login(client)
        for attempt in range(2):
            r = client.request(
                method, f"{API}{path}", headers={"Authorization": f"Bearer {_Session.token}"}, **kw
            )
            if r.status_code == 401 and attempt == 0:  # token expired: log in again
                _login(client)
                continue
            break
    if r.status_code >= 400:
        try:
            detail = r.json().get("detail")
        except ValueError:
            detail = r.text[:300]
        raise ToolError(f"{r.status_code}: {detail}")
    return r.json() if r.content else {"ok": True}


# --- Everyone -----------------------------------------------------------------

@server.tool(annotations=READ)
def whoami() -> dict:
    """Show which school user this server is logged in as."""
    _call("GET", "/api/v1/ai/status")
    return _Session.me or {}


@server.tool(annotations=READ)
def ask_school(question: str) -> dict:
    """Answer a question from the school's documents, notices, holiday
    calendar (and, for parents, their child's homework and fees). Returns the
    answer with the sources it used."""
    return _call("POST", "/api/v1/ai/ask", json={"question": question})


# --- Timetable ------------------------------------------------------------------

@server.tool(annotations=READ)
def timetable_scope() -> dict:
    """Years, classes and sections whose timetable this user can manage."""
    return _call("GET", "/api/v1/timetable/scope")


@server.tool(annotations=READ)
def section_timetable(section_id: int) -> dict:
    """Weekly timetable (periods + subject/teacher per slot) of a section."""
    return _call("GET", f"/api/v1/timetable/sections/{section_id}")


@server.tool(annotations=READ)
def teacher_timetable(teacher_user_id: int | None = None) -> dict:
    """A teacher's weekly timetable. Omit the id for your own."""
    if teacher_user_id is None:
        _call("GET", "/api/v1/ai/status")
        teacher_user_id = (_Session.me or {}).get("id")
    return _call("GET", f"/api/v1/timetable/teachers/{teacher_user_id}")


# --- Teacher --------------------------------------------------------------------

@server.tool(annotations=READ)
def my_classes() -> dict:
    """Sections (with ids) and class-subjects this teacher is assigned to."""
    return _call("GET", "/api/v1/teacher/my-classes")


@server.tool(annotations=READ)
def get_attendance(section_id: int, on_date: str | None = None) -> dict:
    """Roster and attendance already marked for a section on a date
    (YYYY-MM-DD, default today)."""
    return _call(
        "GET",
        "/api/v1/teacher/attendance",
        params={"section_id": section_id, "date": on_date or date.today().isoformat()},
    )


@server.tool(annotations=WRITE)
def save_attendance(
    section_id: int,
    on_date: str,
    entries: list[dict],
) -> dict:
    """Save daily attendance (class teacher only). `entries` is a list of
    {"student_id": int, "status": "present"|"absent"|"late"|"half_day",
    "remark": optional str}. Parents of newly-absent students are alerted.
    Confirm with the user before calling."""
    return _call(
        "POST",
        "/api/v1/teacher/attendance/save",
        json={"section_id": section_id, "date": on_date, "entries": entries},
    )


@server.tool(annotations=WRITE)
def create_homework(
    class_subject_id: int,
    title: str,
    description: str,
    due_date: str,
    notify_parents: bool = False,
) -> dict:
    """Set homework for a class-subject you teach (due_date YYYY-MM-DD).
    Confirm with the user before calling."""
    return _call(
        "POST",
        "/api/v1/teacher/homework",
        json={
            "class_subject_id": class_subject_id,
            "title": title,
            "description": description,
            "due_date": due_date,
            "notify_parents": notify_parents,
        },
    )


@server.tool(annotations=READ)
def draft_from_note(text: str, section_id: int | None = None) -> dict:
    """Turn a teacher's free-text note ("Ravi absent, maths ex 5.2 due Fri")
    into draft attendance + homework with real student / subject ids.
    Nothing is saved; use save_attendance / create_homework after the user
    confirms."""
    return _call("POST", "/api/v1/ai/teacher/smart-entry", json={"text": text, "section_id": section_id})


# --- School admin / principal ------------------------------------------------------

@server.tool(annotations=READ)
def draft_notice(brief: str) -> dict:
    """Draft a notice title and body from a short brief. Nothing is sent."""
    return _call("POST", "/api/v1/ai/school/notices/draft", json={"brief": brief})


@server.tool(annotations=READ)
def list_knowledge_documents() -> list:
    """Documents the school assistant answers from."""
    return _call("GET", "/api/v1/ai/school/knowledge")


@server.tool(annotations=WRITE)
def add_knowledge_document(
    title: str, content: str, audience: Literal["all", "staff"] = "all"
) -> dict:
    """Add a policy/FAQ/circular the assistant can answer from. audience
    'staff' hides it from parents. Confirm with the user before calling."""
    return _call(
        "POST",
        "/api/v1/ai/school/knowledge",
        json={"title": title, "content": content, "audience": audience},
    )


if __name__ == "__main__":
    server.run(transport=os.environ.get("MCP_TRANSPORT", "stdio"))
