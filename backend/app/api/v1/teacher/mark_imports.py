"""Bulk marks upload for the teacher who owns the paper.

The same import machinery the office uses, reached through a door that only
opens onto one paper. A teacher with forty scripts and a spreadsheet should
not have to type them into a grid one at a time, and should not need an
administrator to do it for them — but neither should uploading marks mean
being handed the data desk, which imports students and staff and builds
reports across the whole school.

So: the type is fixed to marks, the paper is checked against who teaches it,
and a job belongs to whoever created it.
"""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.core.enums import ImportType
from app.database import get_db
from app.models.academic import Section
from app.models.datadesk import ImportJob
from app.schemas.report import ImportCommitIn, ImportRead
from app.services import import_service, mark_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


def _own_job(db: Session, user, job_id: int) -> ImportJob:
    """A teacher sees the imports they started, not the school's."""
    job = import_service.get(db, job_id, user.school_id)
    if job.created_by_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found")
    if job.import_type != ImportType.marks:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found")
    return job


@router.get("/template.csv", response_class=PlainTextResponse,
            summary="Blank spreadsheet to fill in")
def template(current_user: TeacherUser):
    return PlainTextResponse(
        import_service.template_csv(ImportType.marks),
        headers={"Content-Disposition": 'attachment; filename="marks-template.csv"'},
    )


@router.get("/papers/{paper_id}/imports", response_model=list[ImportRead],
            summary="Uploads this teacher has made for one paper")
def list_for_paper(paper_id: int, current_user: TeacherUser, db: Db):
    mark_service._check_teacher_owns_paper(db, paper_id, current_user.school_id, current_user.id)
    jobs = list(db.execute(
        select(ImportJob).where(
            ImportJob.school_id == current_user.school_id,
            ImportJob.import_type == ImportType.marks,
            ImportJob.created_by_user_id == current_user.id,
        ).order_by(ImportJob.created_at.desc()).limit(20)
    ).scalars())
    mine = [j for j in jobs if (j.options or {}).get("exam_subject_id") == paper_id]
    return import_service.to_read(db, mine)


@router.post("/papers/{paper_id}/imports", response_model=ImportRead,
             status_code=status.HTTP_201_CREATED,
             summary="Upload marks for one section of a paper; nothing is written yet")
def upload(
    paper_id: int,
    current_user: TeacherUser,
    db: Db,
    section_id: Annotated[int, Form()],
    file: Annotated[UploadFile, File()],
):
    paper, cs, exam = mark_service._check_teacher_owns_paper(
        db, paper_id, current_user.school_id, current_user.id
    )
    if not exam.marks_open:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Marks entry is closed for this exam.")
    section = db.get(Section, section_id)
    if not section or section.school_id != current_user.school_id or section.class_id != cs.class_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "That section doesn't take this paper.")

    job = import_service.create(
        db, current_user, ImportType.marks,
        {"exam_subject_id": paper_id, "section_id": section_id}, file,
    )
    return import_service.to_read(db, [job])[0]


@router.get("/imports/{job_id}", response_model=ImportRead,
            summary="How an upload got on")
def get_import(job_id: int, current_user: TeacherUser, db: Db):
    return import_service.to_read(db, [_own_job(db, current_user, job_id)])[0]


@router.get("/imports/{job_id}/errors.csv", response_class=PlainTextResponse,
            summary="The rows that need fixing")
def errors(job_id: int, current_user: TeacherUser, db: Db):
    _own_job(db, current_user, job_id)
    return PlainTextResponse(
        import_service.errors_csv(db, job_id, current_user.school_id),
        headers={"Content-Disposition": 'attachment; filename="rows-to-fix.csv"'},
    )


@router.post("/imports/{job_id}/commit", response_model=ImportRead,
             summary="Write the good rows")
def commit(job_id: int, payload: ImportCommitIn, current_user: TeacherUser, db: Db):
    _own_job(db, current_user, job_id)
    job = import_service.commit(db, current_user, job_id, payload.skip_bad_rows)
    return import_service.to_read(db, [job])[0]
