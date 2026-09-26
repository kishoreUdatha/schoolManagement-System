"""Grade scales, exam types, report card settings and remarks."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import GradingSetup, allow_job
from app.core.enums import UserRole
from app.database import get_db
from app.models.academic import Section
from app.models.exam import Exam
from app.models.student import Student
from app.models.user import User
from app.schemas.grading import (
    ExamTypeIn,
    ExamTypeRead,
    GradeScaleIn,
    GradeScaleRead,
    RemarkIn,
    RemarkRow,
    ReportCardSettingIn,
    ReportCardSettingRead,
)
from app.services import grading_service as svc
from app.services import result_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
# Teaching staff, plus office staff given the Examinations or Grading job.
Academic = Annotated[User, Depends(allow_job(
    UserRole.school_admin, UserRole.principal, UserRole.teacher,
    permission="exams.manage", also=("grading.manage", "exams.approve_results"),
))]


# ---------- grade scales ----------


@router.get("/grade-scales", response_model=list[GradeScaleRead])
def list_scales(current_user: Academic, db: Db):
    return [svc.scale_to_read(db, s) for s in svc.list_scales(db, current_user.school_id)]


@router.post("/grade-scales", response_model=GradeScaleRead, status_code=status.HTTP_201_CREATED)
def create_scale(payload: GradeScaleIn, current_user: GradingSetup, db: Db):
    return svc.scale_to_read(db, svc.create_scale(db, current_user, payload))


@router.post("/grade-scales/seed-cbse", response_model=GradeScaleRead, status_code=status.HTTP_201_CREATED,
             summary="Create a ready-made CBSE 8-point scale")
def seed(current_user: GradingSetup, db: Db):
    return svc.scale_to_read(db, svc.seed_cbse(db, current_user))


@router.get("/grade-scales/{scale_id}", response_model=GradeScaleRead)
def get_scale(scale_id: int, current_user: Academic, db: Db):
    return svc.scale_to_read(db, svc.get_scale(db, scale_id, current_user.school_id))


@router.put("/grade-scales/{scale_id}", response_model=GradeScaleRead)
def update_scale(scale_id: int, payload: GradeScaleIn, current_user: GradingSetup, db: Db):
    return svc.scale_to_read(db, svc.update_scale(db, current_user, scale_id, payload))


@router.post("/grade-scales/{scale_id}/default", response_model=GradeScaleRead)
def make_default(scale_id: int, current_user: GradingSetup, db: Db):
    return svc.scale_to_read(db, svc.set_default(db, current_user, scale_id))


@router.delete("/grade-scales/{scale_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scale(scale_id: int, current_user: GradingSetup, db: Db):
    svc.delete_scale(db, current_user, scale_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- exam types ----------


@router.get("/exam-types", response_model=list[ExamTypeRead])
def list_types(current_user: Academic, db: Db):
    return [svc.type_to_read(db, t) for t in svc.list_exam_types(db, current_user.school_id)]


@router.post("/exam-types", response_model=ExamTypeRead, status_code=status.HTTP_201_CREATED)
def create_type(payload: ExamTypeIn, current_user: GradingSetup, db: Db):
    return svc.type_to_read(db, svc.create_exam_type(db, current_user, payload))


@router.put("/exam-types/{type_id}", response_model=ExamTypeRead)
def update_type(type_id: int, payload: ExamTypeIn, current_user: GradingSetup, db: Db):
    return svc.type_to_read(db, svc.update_exam_type(db, current_user, type_id, payload))


@router.delete("/exam-types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_type(type_id: int, current_user: GradingSetup, db: Db):
    svc.delete_exam_type(db, current_user, type_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- report card settings ----------


@router.get("/report-card-settings", response_model=ReportCardSettingRead)
def get_settings(current_user: Academic, db: Db):
    return svc.settings(db, current_user.school_id)


@router.put("/report-card-settings", response_model=ReportCardSettingRead)
def put_settings(payload: ReportCardSettingIn, current_user: GradingSetup, db: Db):
    return svc.update_settings(db, current_user, payload)


# ---------- remarks & approval ----------


def _exam(db: Session, exam_id: int, school_id: int) -> Exam:
    e = db.get(Exam, exam_id)
    if not e or e.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    return e


@router.get("/exams/{exam_id}/sections/{section_id}/remarks", response_model=list[RemarkRow],
            summary="Students with their result, rank and remarks")
def section_remarks(exam_id: int, section_id: int, current_user: Academic, db: Db):
    exam = _exam(db, exam_id, current_user.school_id)
    sec = db.get(Section, section_id)
    if not sec or sec.school_id != current_user.school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    students = list(db.execute(
        select(Student).where(Student.section_id == section_id, Student.is_active.is_(True))
        .order_by(Student.roll_no, Student.full_name)
    ).scalars())
    cfg = svc.settings(db, current_user.school_id)
    ranks = svc.rank_map(db, section_id, exam.id) if cfg.show_rank else {}
    remarks = svc.remarks_for(db, exam.id, [s.id for s in students])
    rows = []
    for s in students:
        r = result_service.build_student_result_for_admin(db, current_user.school_id, s.id, exam.id)
        rm = remarks.get(s.id)
        rows.append(dict(
            student_id=s.id, student_name=s.full_name, roll_no=s.roll_no,
            percentage=r["summary"]["percentage"], grade=r["summary"]["overall_grade"],
            rank=ranks.get(s.id), attendance_percent=None,
            teacher_remark=rm.teacher_remark if rm else None,
            principal_remark=rm.principal_remark if rm else None,
            can_edit=svc.can_remark(db, current_user, s),
        ))
    return rows


@router.put("/exams/{exam_id}/students/{student_id}/remark", response_model=RemarkRow)
def save_remark(exam_id: int, student_id: int, payload: RemarkIn, current_user: Academic, db: Db):
    exam = _exam(db, exam_id, current_user.school_id)
    st = db.get(Student, student_id)
    if not st or st.school_id != current_user.school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    r = svc.save_remark(db, current_user, exam, st, payload)
    res = result_service.build_student_result_for_admin(db, current_user.school_id, st.id, exam.id)
    return dict(student_id=st.id, student_name=st.full_name, roll_no=st.roll_no,
                percentage=res["summary"]["percentage"], grade=res["summary"]["overall_grade"],
                teacher_remark=r.teacher_remark, principal_remark=r.principal_remark, can_edit=True)


@router.post("/exams/{exam_id}/approve-results", summary="Approve (or withdraw approval of) results")
def approve(exam_id: int, current_user: Academic, db: Db, approve: bool = True):
    e = svc.approve_results(db, current_user, _exam(db, exam_id, current_user.school_id), approve)
    return {"exam_id": e.id, "results_approved_at": e.results_approved_at}
