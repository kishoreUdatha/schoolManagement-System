"""Bulk imports, saved reports and the exports they produce."""
import json
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core import storage
from app.core.deps import ReportReader, SchoolAdminUser
from app.core.enums import ImportType, ReportSource
from app.database import get_db
from app.models.user import User
from app.schemas.report import (
    ExportRead,
    ImportCancelIn,
    ImportCommitIn,
    ImportRead,
    ReportIn,
    ReportRead,
    ReportResult,
    ReportUpdate,
    SourceInfo,
)
from app.services import import_service, report_service

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


def _json_arg(raw: Optional[str], what: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{what} must be JSON")
    if not isinstance(value, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{what} must be a JSON object")
    return value


# ---------- imports ----------


@router.get("/import-jobs", response_model=list[ImportRead], summary="Past and pending imports")
def list_imports(current_user: SchoolAdminUser, db: Db, import_type: Optional[ImportType] = None,
                 limit: int = Query(50, ge=1, le=200)):
    return import_service.list_jobs(db, current_user.school_id, import_type, limit)


@router.get("/import-jobs/template.csv", response_class=PlainTextResponse, summary="Blank spreadsheet to fill in")
def template(current_user: SchoolAdminUser, import_type: ImportType = Query(...)):
    return PlainTextResponse(
        import_service.template_csv(import_type),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{import_type.value}_import_template.csv"'},
    )


@router.post("/import-jobs", response_model=ImportRead, status_code=status.HTTP_201_CREATED,
             summary="Upload a spreadsheet; it is checked, not imported")
def create_import(
    current_user: SchoolAdminUser,
    db: Db,
    import_type: ImportType = Form(...),
    options: Optional[str] = Form(None, description='JSON, e.g. {"section_id": 3, "academic_year_id": 1}'),
    file: UploadFile = File(...),
):
    job = import_service.create(db, current_user, import_type, _json_arg(options, "options"), file)
    return import_service.to_read(db, [job])[0]


@router.get("/import-jobs/{job_id}", response_model=ImportRead)
def get_import(job_id: int, current_user: SchoolAdminUser, db: Db):
    return import_service.to_read(db, [import_service.get(db, job_id, current_user.school_id)])[0]


@router.get("/import-jobs/{job_id}/errors.csv", response_class=PlainTextResponse, summary="The rows that need fixing")
def import_errors(job_id: int, current_user: SchoolAdminUser, db: Db):
    return PlainTextResponse(
        import_service.errors_csv(db, job_id, current_user.school_id),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="import_{job_id}_problems.csv"'},
    )


@router.post("/import-jobs/{job_id}/commit", response_model=ImportRead, summary="Write the good rows")
def commit_import(job_id: int, payload: ImportCommitIn, current_user: SchoolAdminUser, db: Db):
    job = import_service.commit(db, current_user, job_id, payload.skip_bad_rows)
    return import_service.to_read(db, [job])[0]


@router.patch("/import-jobs/{job_id}", response_model=ImportRead, summary="Cancel an import that hasn't run")
def cancel_import(job_id: int, payload: ImportCancelIn, current_user: SchoolAdminUser, db: Db):
    job = import_service.cancel(db, current_user, job_id, payload.note)
    return import_service.to_read(db, [job])[0]


# ---------- report definitions ----------


@router.get("/report-sources", response_model=list[SourceInfo], summary="What a report can be built on")
def sources(current_user: ReportReader):
    return report_service.catalogue()


@router.get("/report-definitions", response_model=list[ReportRead])
def list_reports(current_user: ReportReader, db: Db, source: Optional[ReportSource] = None,
                 include_inactive: bool = False):
    return report_service.list_reports(db, current_user.school_id, source, include_inactive)


@router.post("/report-definitions", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(payload: ReportIn, current_user: SchoolAdminUser, db: Db):
    return report_service.to_read(db, [report_service.create(db, current_user, payload)])[0]


@router.get("/report-definitions/{report_id}", response_model=ReportRead)
def get_report(report_id: int, current_user: ReportReader, db: Db):
    return report_service.to_read(db, [report_service.get(db, report_id, current_user.school_id)])[0]


@router.patch("/report-definitions/{report_id}", response_model=ReportRead)
def update_report(report_id: int, payload: ReportUpdate, current_user: SchoolAdminUser, db: Db):
    return report_service.to_read(db, [report_service.update(db, current_user, report_id, payload)])[0]


@router.delete("/report-definitions/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(report_id: int, current_user: SchoolAdminUser, db: Db):
    report_service.delete(db, current_user, report_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/report-definitions/{report_id}/run", response_model=ReportResult, summary="Run it and see the rows")
def run_report(report_id: int, current_user: ReportReader, db: Db,
               filters: Optional[dict[str, Any]] = None, limit: int = Query(500, ge=1, le=5000)):
    report = report_service.get(db, report_id, current_user.school_id)
    return report_service.run(db, current_user.school_id, report, filters, limit)


@router.post("/report-definitions/{report_id}/export", response_model=ExportRead, status_code=status.HTTP_201_CREATED,
             summary="Run it and keep the CSV")
def export_report(report_id: int, current_user: ReportReader, db: Db,
                  filters: Optional[dict[str, Any]] = None):
    report = report_service.get(db, report_id, current_user.school_id)
    job = report_service.export(db, current_user, report, filters)
    return report_service.export_to_read(db, [job])[0]


# ---------- exports ----------


@router.get("/export-jobs", response_model=list[ExportRead])
def list_exports(current_user: SchoolAdminUser, db: Db, limit: int = Query(50, ge=1, le=200)):
    return report_service.list_exports(db, current_user.school_id, limit)


@router.get("/export-jobs/{job_id}", response_model=ExportRead)
def get_export(job_id: int, current_user: SchoolAdminUser, db: Db):
    return report_service.export_to_read(db, [report_service.get_export(db, job_id, current_user.school_id)])[0]


@router.get("/export-jobs/{job_id}/file", summary="Download the CSV again")
def download_export(job_id: int, current_user: SchoolAdminUser, db: Db):
    job, body = report_service.download(db, job_id, current_user.school_id)
    return Response(
        content=body, media_type="text/csv",
        headers={"Content-Disposition": storage.content_disposition(job.file_name or "export.csv", inline=False)},
    )
