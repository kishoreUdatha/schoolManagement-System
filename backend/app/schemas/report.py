from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.core.enums import ExportStatus, ImportStatus, ImportType, ReportSource


class ReportIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    code: str = Field(..., min_length=2, max_length=40)
    description: Optional[str] = None
    source: ReportSource
    filters: dict[str, Any] = {}
    columns: list[str] = []
    sort_by: Optional[str] = Field(None, max_length=60)


class ReportUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=160)
    code: Optional[str] = Field(None, min_length=2, max_length=40)
    description: Optional[str] = None
    filters: Optional[dict[str, Any]] = None
    columns: Optional[list[str]] = None
    sort_by: Optional[str] = Field(None, max_length=60)
    is_active: Optional[bool] = None


class ReportRead(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    source: ReportSource
    source_label: str
    filters: dict[str, Any]
    columns: list[str]
    sort_by: Optional[str]
    is_active: bool
    created_by_name: Optional[str]
    last_run_at: Optional[datetime]
    run_count: int


class SourceInfo(BaseModel):
    source: str
    label: str
    columns: list[str]
    filters: list[str]


class ReportResult(BaseModel):
    report_id: int
    name: str
    columns: list[str]
    row_count: int
    rows: list[dict[str, Any]]
    truncated: bool


class ExportRead(BaseModel):
    id: int
    report_definition_id: Optional[int]
    name: str
    status: ExportStatus
    row_count: int
    file_name: Optional[str]
    size_bytes: Optional[int]
    message: Optional[str]
    requested_by_name: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]


class ImportRowError(BaseModel):
    row: Optional[int] = None
    value: Optional[str] = None
    error: Optional[str] = None


class ImportRead(BaseModel):
    id: int
    import_type: ImportType
    status: ImportStatus
    file_name: str
    options: dict[str, Any]
    total_rows: int
    success_rows: int
    error_rows: int
    errors: list[ImportRowError]
    message: Optional[str]
    created_by_name: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]


class ImportCommitIn(BaseModel):
    skip_bad_rows: bool = True


class ImportCancelIn(BaseModel):
    note: Optional[str] = Field(None, max_length=500)
