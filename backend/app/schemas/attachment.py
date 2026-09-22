from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AttachmentRead(BaseModel):
    """An uploaded file on a record. Download it from the record's own
    …/files/{id} path, which checks the reader may see the record."""

    id: int
    file_name: str
    content_type: str
    size_bytes: int
    uploaded_by_name: Optional[str] = None
    created_at: datetime
