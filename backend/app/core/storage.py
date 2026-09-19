"""File storage for uploaded documents.

Files live under settings.storage_dir, keyed "<school_id>/<area>/<uuid>.<ext>".
Only the key is stored in the database, so swapping this module for S3 later
doesn't touch the models.
"""
import os
import uuid
from pathlib import Path

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


def _root() -> Path:
    return Path(settings.storage_dir)


def _path(key: str) -> Path:
    p = (_root() / key).resolve()
    if _root().resolve() not in p.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bad file key")
    return p


def save_upload(school_id: int, area: str, upload: UploadFile) -> dict:
    """Validate type + size, write to disk. Returns key/content_type/size/original_name."""
    name = upload.filename or "file"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF, JPG, PNG or WEBP files can be uploaded",
        )
    content_type, magics = ALLOWED[ext]
    limit = settings.max_upload_mb * 1024 * 1024
    data = upload.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is larger than {settings.max_upload_mb} MB",
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
