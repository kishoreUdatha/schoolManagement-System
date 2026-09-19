from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import storage
from app.core.enums import DocumentCategory, DocumentOwner, UserRole, VerificationStatus
from app.core.scoping import get_school_student, require_linked_child
from app.models.document import Document
from app.models.staff import Staff
from app.models.student import Student
from app.models.user import User
from app.schemas.document import DocumentUpdate, DocumentVerify


EXPIRY_WARNING_DAYS = 30


def _check_owner(db: Session, school_id: int, owner_type: DocumentOwner, owner_id: Optional[int]) -> None:
    if owner_type == DocumentOwner.school:
        if owner_id is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="School documents have no owner_id")
        return
    if owner_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="owner_id is required")
    if owner_type == DocumentOwner.student:
        get_school_student(db, owner_id, school_id)
    else:
        s = db.get(Staff, owner_id)
        if not s or s.school_id != school_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")


def _owner_name(db: Session, d: Document) -> Optional[str]:
    if d.owner_type == DocumentOwner.student and d.owner_id:
        s = db.get(Student, d.owner_id)
        return s.full_name if s else None
    if d.owner_type == DocumentOwner.staff and d.owner_id:
        st = db.get(Staff, d.owner_id)
        u = db.get(User, st.user_id) if st else None
        return u.full_name if u else None
    return None


def to_read(db: Session, d: Document) -> dict:
    uploader = db.get(User, d.uploaded_by_user_id) if d.uploaded_by_user_id else None
    verifier = db.get(User, d.verified_by_user_id) if d.verified_by_user_id else None
    return {
        "id": d.id,
        "owner_type": d.owner_type,
        "owner_id": d.owner_id,
        "owner_name": _owner_name(db, d),
        "category": d.category,
        "title": d.title,
        "content_type": d.content_type,
        "size_bytes": d.size_bytes,
        "original_name": d.original_name,
        "expires_on": d.expires_on,
        "visible_to_parent": d.visible_to_parent,
        "uploaded_by_name": uploader.full_name if uploader else None,
        "uploaded_by_parent": bool(uploader and uploader.role == UserRole.parent),
        "verification_status": d.verification_status,
        "verified_by_name": verifier.full_name if verifier else None,
        "verified_at": d.verified_at,
        "remarks": d.remarks,
        "created_at": d.created_at,
    }


def upload(
    db: Session,
    *,
    tenant_id: int,
    school_id: int,
    actor: User,
    owner_type: DocumentOwner,
    owner_id: Optional[int],
    category: DocumentCategory,
    title: str,
    file: UploadFile,
    expires_on: Optional[date] = None,
    visible_to_parent: bool = True,
) -> Document:
    _check_owner(db, school_id, owner_type, owner_id)
    stored = storage.save_upload(school_id, f"documents/{owner_type.value}", file)
    by_office = actor.role != UserRole.parent
    now = datetime.now(timezone.utc)
    d = Document(
        tenant_id=tenant_id,
        school_id=school_id,
        owner_type=owner_type,
        owner_id=owner_id,
        category=category,
        title=title.strip() or stored["original_name"],
        storage_key=stored["key"],
        content_type=stored["content_type"],
        size_bytes=stored["size_bytes"],
        original_name=stored["original_name"],
        expires_on=expires_on,
        visible_to_parent=visible_to_parent,
        uploaded_by_user_id=actor.id,
        # Office uploads are trusted; parent uploads wait for verification.
        verification_status=VerificationStatus.verified if by_office else VerificationStatus.pending,
        verified_by_user_id=actor.id if by_office else None,
        verified_at=now if by_office else None,
    )
    db.add(d)
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(stored["key"])
        raise
    db.refresh(d)
    return d


def _get(db: Session, doc_id: int, school_id: int) -> Document:
    d = db.get(Document, doc_id)
    if not d or d.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return d


def get(db: Session, doc_id: int, school_id: int) -> Document:
    return _get(db, doc_id, school_id)


def list_(
    db: Session,
    school_id: int,
    *,
    owner_type: Optional[DocumentOwner] = None,
    owner_id: Optional[int] = None,
    category: Optional[DocumentCategory] = None,
    verification: Optional[VerificationStatus] = None,
    expiring: bool = False,
) -> list[Document]:
    stmt = select(Document).where(Document.school_id == school_id)
    if owner_type:
        stmt = stmt.where(Document.owner_type == owner_type)
    if owner_id is not None:
        stmt = stmt.where(Document.owner_id == owner_id)
    if category:
        stmt = stmt.where(Document.category == category)
    if verification:
        stmt = stmt.where(Document.verification_status == verification)
    if expiring:
        stmt = stmt.where(
            Document.expires_on.is_not(None),
            Document.expires_on <= date.today() + timedelta(days=EXPIRY_WARNING_DAYS),
        )
    return list(db.execute(stmt.order_by(Document.created_at.desc()).limit(500)).scalars())


def update(db: Session, doc_id: int, school_id: int, data: DocumentUpdate) -> Document:
    d = _get(db, doc_id, school_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return d


def verify(db: Session, doc_id: int, school_id: int, actor_id: int, data: DocumentVerify) -> Document:
    d = _get(db, doc_id, school_id)
    if data.status == VerificationStatus.rejected and not (data.remarks or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tell the parent why the document was rejected",
        )
    d.verification_status = data.status
    d.remarks = (data.remarks or "").strip() or None
    d.verified_by_user_id = actor_id if data.status != VerificationStatus.pending else None
    d.verified_at = datetime.now(timezone.utc) if data.status != VerificationStatus.pending else None
    db.commit()
    db.refresh(d)
    return d


def delete(db: Session, doc_id: int, school_id: int) -> None:
    d = _get(db, doc_id, school_id)
    key = d.storage_key
    db.delete(d)
    db.commit()
    storage.delete(key)


def summary(db: Session, school_id: int) -> dict:
    pending = db.execute(
        select(func.count(Document.id)).where(
            Document.school_id == school_id,
            Document.verification_status == VerificationStatus.pending,
        )
    ).scalar_one()
    expiring = db.execute(
        select(func.count(Document.id)).where(
            Document.school_id == school_id,
            Document.expires_on.is_not(None),
            Document.expires_on <= date.today() + timedelta(days=EXPIRY_WARNING_DAYS),
        )
    ).scalar_one()
    by_owner = {
        o.value: c
        for o, c in db.execute(
            select(Document.owner_type, func.count(Document.id))
            .where(Document.school_id == school_id)
            .group_by(Document.owner_type)
        ).all()
    }
    return {"pending_verification": pending, "expiring_soon": expiring, "by_owner": by_owner}


# --- Parent side ---

def list_for_child(db: Session, parent_user_id: int, student_id: int) -> list[Document]:
    require_linked_child(db, parent_user_id, student_id)
    return list(
        db.execute(
            select(Document)
            .where(
                Document.owner_type == DocumentOwner.student,
                Document.owner_id == student_id,
                Document.visible_to_parent.is_(True),
            )
            .order_by(Document.created_at.desc())
        ).scalars()
    )


def get_for_child(db: Session, parent_user_id: int, student_id: int, doc_id: int) -> Document:
    require_linked_child(db, parent_user_id, student_id)
    d = db.get(Document, doc_id)
    if (
        not d
        or d.owner_type != DocumentOwner.student
        or d.owner_id != student_id
        or not d.visible_to_parent
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return d


def parent_delete(db: Session, parent: User, student_id: int, doc_id: int) -> None:
    """Parents may withdraw their own uploads until the office verifies them."""
    d = get_for_child(db, parent.id, student_id, doc_id)
    if d.uploaded_by_user_id != parent.id or d.verification_status == VerificationStatus.verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only your own unverified uploads can be removed",
        )
    key = d.storage_key
    db.delete(d)
    db.commit()
    storage.delete(key)
