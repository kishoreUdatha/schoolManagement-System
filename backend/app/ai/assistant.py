"""'Ask the school' assistant (RAG).

Retrieval is Postgres full-text search over the school's knowledge base plus
live records the asker is allowed to see (notices sent to them, upcoming
holidays, and for parents their children's homework and pending fees). The
top matches go to Claude as numbered sources; the answer cites them.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.ai.client import AIUnavailable, json_call, obj
from app.core.enums import NoticeStatus, UserRole
from app.models.holiday import Holiday
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.models.notice import Notice, NoticeRecipient
from app.models.tenant import School
from app.models.user import User

CHUNK_CHARS = 1500
TOP_K = 6

_STOP = set(
    "a an and are as at be by can do does for from has have how i in is it me my "
    "of on or our the this to was what when where which who why will with you your "
    "please tell about there".split()
)


# --- Knowledge base CRUD ----------------------------------------------------

def chunk(text_: str) -> list[str]:
    """Split on paragraphs, packing them into ~CHUNK_CHARS pieces."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text_) if p.strip()]
    chunks: list[str] = []
    cur = ""
    for p in paras:
        while len(p) > CHUNK_CHARS:  # very long paragraph: hard split
            chunks.append(p[:CHUNK_CHARS])
            p = p[CHUNK_CHARS:]
        if cur and len(cur) + len(p) + 2 > CHUNK_CHARS:
            chunks.append(cur)
            cur = p
        else:
            cur = f"{cur}\n\n{p}" if cur else p
    if cur:
        chunks.append(cur)
    return chunks


def add_document(
    db: Session, user: User, *, title: str, content: str, audience: str
) -> KnowledgeDocument:
    doc = KnowledgeDocument(
        tenant_id=user.tenant_id,
        school_id=user.school_id,
        title=title.strip(),
        content=content.strip(),
        audience=audience,
        created_by_user_id=user.id,
    )
    db.add(doc)
    db.flush()
    for i, piece in enumerate(chunk(f"{doc.title}\n\n{doc.content}")):
        db.add(
            KnowledgeChunk(
                school_id=user.school_id, document_id=doc.id, chunk_index=i, content=piece
            )
        )
    db.commit()
    db.refresh(doc)
    return doc


# --- Retrieval --------------------------------------------------------------

def _terms(question: str) -> list[str]:
    words = re.findall(r"[a-zA-Z0-9]+", question.lower())
    return [w for w in words if len(w) > 2 and w not in _STOP][:20]


def _search_kb(db: Session, user: User, terms: list[str]) -> list[dict]:
    if not terms:
        return []
    # OR the terms so partial matches still rank; ts_rank_cd orders them.
    tsq = func.to_tsquery("english", " | ".join(terms))
    rank = func.ts_rank_cd(KnowledgeChunk.search, tsq).label("rank")
    stmt = (
        select(KnowledgeChunk.content, KnowledgeDocument.title, rank)
        .join(KnowledgeDocument, KnowledgeChunk.document_id == KnowledgeDocument.id)
        .where(KnowledgeChunk.school_id == user.school_id, KnowledgeChunk.search.op("@@")(tsq))
        .order_by(rank.desc())
        .limit(TOP_K)
    )
    if user.role in (UserRole.parent, UserRole.student):
        stmt = stmt.where(KnowledgeDocument.audience == "all")
    return [
        {"title": title, "kind": "School document", "text": content}
        for content, title, _ in db.execute(stmt).all()
    ]


def _notices(db: Session, user: User, terms: list[str]) -> list[dict]:
    stmt = select(Notice).where(
        Notice.school_id == user.school_id,
        Notice.status == NoticeStatus.sent,
        Notice.sent_at >= func.now() - text("interval '120 days'"),
    )
    if user.role not in (UserRole.school_admin, UserRole.principal):
        stmt = stmt.where(
            Notice.id.in_(select(NoticeRecipient.notice_id).where(NoticeRecipient.user_id == user.id))
        )
    if terms:
        stmt = stmt.where(
            or_(*[Notice.title.ilike(f"%{t}%") for t in terms], *[Notice.body.ilike(f"%{t}%") for t in terms])
        )
    rows = db.execute(stmt.order_by(Notice.sent_at.desc()).limit(4)).scalars().all()
    return [
        {
            "title": n.title,
            "kind": f"Notice sent {n.sent_at:%d %b %Y}" if n.sent_at else "Notice",
            "text": n.body[:CHUNK_CHARS],
        }
        for n in rows
    ]


def _holidays(db: Session, user: User) -> list[dict]:
    today = date.today()
    rows = db.execute(
        select(Holiday)
        .where(
            Holiday.school_id == user.school_id,
            Holiday.end_date >= today,
            Holiday.start_date <= today + timedelta(days=180),
        )
        .order_by(Holiday.start_date)
        .limit(15)
    ).scalars().all()
    if not rows:
        return []
    lines = [
        f"- {h.name}: {h.start_date:%a %d %b %Y}"
        + (f" to {h.end_date:%a %d %b %Y}" if h.end_date != h.start_date else "")
        for h in rows
    ]
    return [{"title": "Upcoming holidays", "kind": "Holiday calendar", "text": "\n".join(lines)}]


def _parent_context(db: Session, user: User) -> list[dict]:
    from app.models.parent import ParentStudent
    from app.models.student import Student
    from app.services import fee_service, homework_service

    out = []
    children = db.execute(
        select(Student)
        .join(ParentStudent, ParentStudent.student_id == Student.id)
        .where(ParentStudent.parent_user_id == user.id)
    ).scalars().all()
    for child in children:
        lines = []
        try:
            hw = homework_service.list_for_child(db, user.id, child.id)
            upcoming = [h for h in hw if h.due_date >= date.today()][:8]
            lines += [f"- Homework: {h.title}, due {h.due_date:%a %d %b}" for h in upcoming]
        except Exception:  # noqa: BLE001 - context is best-effort
            pass
        try:
            pending = fee_service.child_pending_total(db, child.id)
            lines.append(f"- Pending fees: {pending}")
        except Exception:  # noqa: BLE001
            pass
        if lines:
            out.append({"title": f"{child.full_name}'s current items", "kind": "Your child", "text": "\n".join(lines)})
    return out


# --- Answering --------------------------------------------------------------

SYSTEM = """You are the help desk assistant of a school, answering questions from
parents and staff inside the school's app. Answer only from the numbered
sources provided. Cite the sources you used as [1], [2] inside the answer.
If the sources don't contain the answer, say you don't know and suggest
contacting the school office; never guess dates, amounts or rules. Keep answers
short and practical, in the language of the question."""


def ask(db: Session, user: User, question: str) -> dict:
    terms = _terms(question)
    sources = _search_kb(db, user, terms) + _notices(db, user, terms) + _holidays(db, user)
    if user.role == UserRole.parent:
        sources += _parent_context(db, user)
    school = db.get(School, user.school_id)

    if not sources:
        return {
            "answer": "I couldn't find anything about that in the school's information. "
            "Please contact the school office.",
            "sources": [],
        }
    numbered = "\n\n".join(
        f"[{i}] {s['kind']} - {s['title']}\n{s['text']}" for i, s in enumerate(sources, 1)
    )
    data = json_call(
        system=SYSTEM,
        content=(
            f"School: {school.name if school else ''}\nToday: {date.today():%A %d %B %Y}\n"
            f"Asked by: a {user.role.value.replace('_', ' ')}\n\nSources:\n{numbered}\n\n"
            f"Question: {question}"
        ),
        schema=obj(
            {
                "answer": {"type": "string"},
                "used_sources": {"type": "array", "items": {"type": "integer"}},
            }
        ),
        effort="low",
        max_tokens=4000,
    )
    used = [i for i in data["used_sources"] if 1 <= i <= len(sources)]
    return {
        "answer": data["answer"],
        "sources": [
            {"n": i, "title": sources[i - 1]["title"], "kind": sources[i - 1]["kind"]} for i in used
        ],
    }


__all__ = ["AIUnavailable", "add_document", "ask", "chunk"]
