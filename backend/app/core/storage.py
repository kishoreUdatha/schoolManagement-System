"""File storage for uploaded documents.

Files live under settings.storage_dir, keyed "<school_id>/<area>/<uuid>.<ext>".
Only the key is stored in the database, so swapping this module for S3 later
doesn't touch the models.
"""
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile, status

from app.config import settings


# extension -> (content type, magic-byte prefixes)
ALLOWED = {
    "pdf": ("application/pdf", (b"%PDF",)),
    "jpg": ("image/jpeg", (b"\xff\xd8\xff",)),
    "jpeg": ("image/jpeg", (b"\xff\xd8\xff",)),
    "png": ("image/png", (b"\x89PNG",)),
    "webp": ("image/webp", (b"RIFF",)),
}

_DOCX = ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", (b"PK\x03\x04",))
_DOC = ("application/msword", (b"\xd0\xcf\x11\xe0",))

# Files people attach to records (homework, leave notes, event circulars…):
# the images and PDFs above plus Word documents.
ATTACHMENT_TYPES = {**ALLOWED, "docx": _DOCX, "doc": _DOC}

# A résumé sent from the public careers page.
RESUME_TYPES = {"pdf": ALLOWED["pdf"], "docx": _DOCX, "doc": _DOC}

# A school logo: images only, since it is shown in an <img>.
LOGO_TYPES = {k: v for k, v in ALLOWED.items() if k != "pdf"}


def describe(allowed: dict) -> str:
    """'PDF, JPG, PNG or WEBP' for an error message."""
    names = list(dict.fromkeys("JPG" if k in ("jpg", "jpeg") else k.upper() for k in allowed))
    return ", ".join(names[:-1]) + (" or " if len(names) > 1 else "") + names[-1]


def _root() -> Path:
    return Path(settings.storage_dir)


def _path(key: str) -> Path:
    p = (_root() / key).resolve()
    if _root().resolve() not in p.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bad file key")
    return p


def save_upload(school_id: int, area: str, upload: UploadFile,
                allowed: Optional[dict] = None, max_mb: Optional[int] = None) -> dict:
    """Validate type + size, write to disk. Returns key/content_type/size/original_name.

    `allowed` narrows or widens the accepted types (default: PDF and images);
    `max_mb` lowers the size limit below settings.max_upload_mb."""
    allowed = allowed or ALLOWED
    max_mb = min(max_mb or settings.max_upload_mb, settings.max_upload_mb)
    name = upload.filename or "file"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only {describe(allowed)} files can be uploaded",
        )
    content_type, magics = allowed[ext]
    limit = max_mb * 1024 * 1024
    data = upload.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is larger than {max_mb} MB",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")
    if not any(data.startswith(m) for m in magics):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File contents don't match its extension",
        )
    key = f"{school_id}/{area}/{uuid.uuid4().hex}.{ext}"
    path = _path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {
        "key": key,
        "content_type": content_type,
        "size_bytes": len(data),
        "original_name": os.path.basename(name)[:200],
    }


def read(key: str) -> bytes:
    path = _path(key)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing from storage")
    return path.read_bytes()


def delete(key: str) -> None:
    try:
        _path(key).unlink(missing_ok=True)
    except HTTPException:
        pass


def content_disposition(filename: str, inline: bool = True) -> str:
    """Header value that survives non-ASCII names (RFC 6266 filename*)."""
    from urllib.parse import quote

    ascii_name = filename.encode("ascii", "ignore").decode().replace('"', "") or "file"
    kind = "inline" if inline else "attachment"
    return f"{kind}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


def save_csv_upload(school_id: int, area: str, upload: UploadFile) -> dict:
    """A CSV upload, which has no magic bytes to check — so we check that it is
    text we can actually read instead. Returns the same shape as save_upload."""
    name = upload.filename or "file.csv"
    if not name.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload a .csv file")
    limit = settings.max_upload_mb * 1024 * 1024
    data = upload.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is larger than {settings.max_upload_mb} MB",
        )
    if not data.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")
    try:
        data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That file isn't plain UTF-8 text — re-save it as CSV UTF-8",
        )
    return _write(school_id, area, "csv", data, "text/csv", os.path.basename(name)[:200])


def save_generated(school_id: int, area: str, filename: str, data: bytes, content_type: str) -> dict:
    """Store a file we produced ourselves (an export, an error report)."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return _write(school_id, area, ext, data, content_type, filename[:200])


def _write(school_id: int, area: str, ext: str, data: bytes, content_type: str, original: str) -> dict:
    key = f"{school_id}/{area}/{uuid.uuid4().hex}.{ext}"
    path = _path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"key": key, "content_type": content_type, "size_bytes": len(data), "original_name": original}
