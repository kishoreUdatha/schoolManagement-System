"""Uploaded files on records (homework, submissions, leave requests, events…).

This module stores, lists and serves the files. It never decides who may see
them: every route first loads the owning record through that record's own
access check (the parent's child, the teacher's class, the published event)
and only then asks for the file by (kind, owner id, file id). A file id that
belongs to some other record is a 404.
"""
from __future__ import annotations

from typing import Iterable, Optional

from fastapi import HTTPException, Response, UploadFile, status
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.orm import Session

from app.core import storage
from app.models.attachment import Attachment
from app.models.user import User


KINDS = {
    "homework",             # the teacher's worksheet on a homework
    "homework_submission",  # what the student / parent handed in
    "homework_review",      # the teacher's marked copy / feedback file
    "project",              # the teacher's brief on a project
    "project_review",       # the teacher's feedback file on a student's project
    "student_leave",        # a parent's supporting document (medical note…)
    "event",                # a circular / permission slip on an event
    "message",              # a file sent with a message (parent requests)
}

MAX_FILES = 5  # per record


def _404() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


def list_for(db: Session, kind: str, owner_id: int) -> list[Attachment]:
    return list(db.execute(
        select(Attachment).where(Attachment.owner_type == kind, Attachment.owner_id == owner_id)
        .order_by(Attachment.id)
    ).scalars())


def to_read(db: Session, rows: Iterable[Attachment]) -> list[dict]:
    rows = list(rows)
    ids = {a.uploaded_by_user_id for a in rows if a.uploaded_by_user_id}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}
    return [
        dict(id=a.id, file_name=a.file_name, content_type=a.content_type, size_bytes=a.size_bytes,
             uploaded_by_name=names.get(a.uploaded_by_user_id), created_at=a.created_at)
        for a in rows
    ]


def read_for(db: Session, kind: str, owner_id: Optional[int]) -> list[dict]:
    """The files on one record, ready for a response (empty for no record)."""
    if not owner_id:
        return []
    return to_read(db, list_for(db, kind, owner_id))


def read_many(db: Session, kind: str, owner_ids: Iterable[int]) -> dict[int, list[dict]]:
    """Files for many records of one kind in one query: {owner_id: [file…]}."""
    ids = {i for i in owner_ids if i}
    if not ids:
        return {}
    rows = list(db.execute(
        select(Attachment).where(Attachment.owner_type == kind, Attachment.owner_id.in_(ids))
        .order_by(Attachment.id)
    ).scalars())
    out: dict[int, list[dict]] = {}
    for a, d in zip(rows, to_read(db, rows)):
        out.setdefault(a.owner_id, []).append(d)
    return out


def add(db: Session, *, kind: str, owner_id: int, tenant_id: int, school_id: int,
        user_id: Optional[int], files: list[UploadFile], commit: bool = True) -> list[Attachment]:
    """Store the files and link them to the record. All or nothing: if one
    file is refused, none of them is kept."""
    assert kind in KINDS, kind
    files = [f for f in files if f is not None and (f.filename or "")]
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a file to upload")
    have = len(list_for(db, kind, owner_id))
    if have + len(files) > MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Up to {MAX_FILES} files can be attached here" + (f" ({have} already are)" if have else ""),
        )
    saved: list[dict] = []
    try:
        for f in files:
            saved.append(storage.save_upload(school_id, f"attachments/{kind}", f, allowed=storage.ATTACHMENT_TYPES))
    except Exception:
        for s in saved:
            storage.delete(s["key"])
        raise
    rows = [
        Attachment(tenant_id=tenant_id, school_id=school_id, owner_type=kind, owner_id=owner_id,
                   file_key=s["key"], file_name=s["original_name"], content_type=s["content_type"],
                   size_bytes=s["size_bytes"], uploaded_by_user_id=user_id)
        for s in saved
    ]
    db.add_all(rows)
    if commit:
        db.commit()
        for r in rows:
            db.refresh(r)
    else:
        db.flush()
    return rows


def get(db: Session, kind: str, owner_id: int, attachment_id: int) -> Attachment:
    a = db.get(Attachment, attachment_id)
    if not a or a.owner_type != kind or a.owner_id != owner_id:
        raise _404()
    return a


def get_any(db: Session, kinds: Iterable[str], owner_id: int, attachment_id: int) -> Attachment:
    """A file on one record that may be filed under any of `kinds` (a
    submission's own files and the teacher's review files, say)."""
    a = db.get(Attachment, attachment_id)
    if not a or a.owner_type not in set(kinds) or a.owner_id != owner_id:
        raise _404()
    return a


def remove(db: Session, a: Attachment) -> None:
    key = a.file_key
    db.delete(a)
    db.commit()
    storage.delete(key)


def remove_all(db: Session, kind: str, owner_ids: Iterable[int]) -> None:
    """Drop every file on these records (call when the records are deleted).
    Does not commit: it rides on the caller's delete."""
    ids = [i for i in owner_ids if i]
    if not ids:
        return
    keys = list(db.execute(
        select(Attachment.file_key).where(Attachment.owner_type == kind, Attachment.owner_id.in_(ids))
    ).scalars())
    db.execute(sa_delete(Attachment).where(Attachment.owner_type == kind, Attachment.owner_id.in_(ids)))
    for k in keys:
        storage.delete(k)


_INLINE = {"application/pdf", "image/jpeg", "image/png", "image/webp"}


def file_response(a: Attachment) -> Response:
    """The file itself. PDFs and images open in the browser; anything else
    (Word) downloads. nosniff so a browser never runs it as something else."""
    return Response(
        content=storage.read(a.file_key),
        media_type=a.content_type,
        headers={
            "Content-Disposition": storage.content_disposition(a.file_name, inline=a.content_type in _INLINE),
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )
