"""AI endpoints. Every write-type feature returns a draft; saving goes through
the normal endpoints so permissions and validation stay in one place."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from typing import Annotated, Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import assistant, client, drafting, quick_entry
from app.core.deps import CurrentUser, SchoolAdminOrPrincipal, SchoolAdminUser, TeacherUser
from app.database import get_db
from app.models.academic import Section
from app.models.knowledge import KnowledgeDocument
from app.models.tenant import School
from app.services import weekly_report_service

router = APIRouter()
DB = Annotated[Session, Depends(get_db)]


def _unavailable(exc: client.AIUnavailable) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


def _school_user(user: CurrentUser):
    if user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="School account required")
    return user


SchoolUser = Annotated[object, Depends(_school_user)]


@router.get("/status", summary="Whether AI features are available")
def ai_status(_: CurrentUser):
    return {"enabled": client.enabled(), "model": client.model() if client.enabled() else None}


# --- Teacher: smart entry ---------------------------------------------------

class SmartEntryRequest(BaseModel):
    text: str = Field(..., min_length=3, max_length=4000)
    section_id: Optional[int] = None


@router.post("/teacher/smart-entry", summary="Turn a plain-language note into draft attendance + homework")
def smart_entry(payload: SmartEntryRequest, current_user: TeacherUser, db: DB):
    try:
        return quick_entry.propose(
            db,
            teacher_id=current_user.id,
            school_id=current_user.school_id,
            text=payload.text,
            section_hint=payload.section_id,
        )
    except client.AIUnavailable as e:
        raise _unavailable(e)


# --- Teacher: parent summaries for weekly reports ---------------------------

class SummarizeRequest(BaseModel):
    section_id: int
    week_start: date


@router.post("/teacher/weekly-reports/summarize", summary="Write plain-language parent notes for a week's reports")
def summarize_week(payload: SummarizeRequest, current_user: TeacherUser, db: DB):
    sec = db.get(Section, payload.section_id)
    if not sec or sec.school_id != current_user.school_id:
        raise HTTPException(status_code=404, detail="Section not found")
    if sec.class_teacher_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the class teacher can do this")
    reports = weekly_report_service.list_for_section_week(
        db, payload.section_id, payload.week_start, current_user.school_id
    )
    if not reports:
        raise HTTPException(status_code=400, detail="Generate the weekly reports first")
    if not client.enabled():
        raise _unavailable(client.AIUnavailable("AI features are not configured on this server"))

    dicts = [weekly_report_service.to_read_dict(db, r) for r in reports]

    def one(d: dict) -> Optional[str]:
        try:
            return drafting.weekly_summary(d)
        except client.AIUnavailable:
            return None

    with ThreadPoolExecutor(max_workers=4) as pool:
        summaries = list(pool.map(one, dicts))
    done = 0
    for r, text in zip(reports, summaries):
        if text:
            r.ai_summary = text
            done += 1
    db.commit()
    return {"written": done, "failed": len(reports) - done}


# --- Admin: extract students from text / photo / PDF ------------------------

@router.post("/school/students/extract", summary="Extract student rows from pasted text, a photo or a PDF")
async def extract_students(
    current_user: SchoolAdminUser,
    text: Annotated[Optional[str], Form(max_length=100_000)] = None,
    file: Annotated[Optional[UploadFile], File()] = None,
):
    file_bytes = await file.read() if file else None
    try:
        return drafting.extract_students(
            text=text, file_bytes=file_bytes, media_type=file.content_type if file else None
        )
    except client.AIUnavailable as e:
        raise _unavailable(e)


# --- Admin / principal: draft a notice --------------------------------------

class NoticeDraftRequest(BaseModel):
    brief: str = Field(..., min_length=5, max_length=4000)


@router.post("/school/notices/draft", summary="Draft a notice title + body from a short brief")
def draft_notice(payload: NoticeDraftRequest, current_user: SchoolAdminOrPrincipal, db: DB):
    school = db.get(School, current_user.school_id)
    today = datetime.now(ZoneInfo(school.timezone if school else "Asia/Kolkata")).date()
    try:
        return drafting.draft_notice(payload.brief, school.name if school else "", today)
    except client.AIUnavailable as e:
        raise _unavailable(e)


# --- Everyone: ask the school (RAG) -----------------------------------------

class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000)


@router.post("/ask", summary="Answer a question from the school's documents, notices and calendar")
def ask(payload: AskRequest, current_user: SchoolUser, db: DB):
    try:
        return assistant.ask(db, current_user, payload.question)
    except client.AIUnavailable as e:
        raise _unavailable(e)


# --- Admin / principal: knowledge base --------------------------------------

class KnowledgeCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    content: str = Field(..., min_length=10, max_length=200_000)
    audience: Literal["all", "staff"] = "all"


def _doc_dict(d: KnowledgeDocument) -> dict:
    return {
        "id": d.id,
        "title": d.title,
        "audience": d.audience,
        "chars": len(d.content),
        "preview": d.content[:200],
        "updated_at": d.updated_at,
    }


@router.get("/school/knowledge", summary="List knowledge-base documents")
def list_knowledge(current_user: SchoolAdminOrPrincipal, db: DB):
    docs = db.execute(
        select(KnowledgeDocument)
        .where(KnowledgeDocument.school_id == current_user.school_id)
        .order_by(KnowledgeDocument.updated_at.desc())
    ).scalars()
    return [_doc_dict(d) for d in docs]


@router.post("/school/knowledge", status_code=201, summary="Add a document the assistant can answer from")
def add_knowledge(payload: KnowledgeCreate, current_user: SchoolAdminOrPrincipal, db: DB):
    doc = assistant.add_document(
        db, current_user, title=payload.title, content=payload.content, audience=payload.audience
    )
    return _doc_dict(doc)


@router.delete("/school/knowledge/{doc_id}", status_code=204)
def delete_knowledge(doc_id: int, current_user: SchoolAdminOrPrincipal, db: DB):
    doc = db.get(KnowledgeDocument, doc_id)
    if not doc or doc.school_id != current_user.school_id:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return Response(status_code=204)
