"""Stories 10.1 + 10.2 — Project assignment and progress tracking."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import (
    NoticeAudience,
    NoticeChannel,
    NoticeStatus,
    ProjectProgressStatus,
)
from app.models.academic import SchoolClass, Section
from app.models.notice import Notice
from app.models.parent import ParentStudent
from app.models.project import Project, ProjectProgress
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User
from app.schemas.project import (
    ProgressReview,
    ProgressUpdate,
    ProjectCreate,
    ProjectUpdate,
)
from app.services import attachment_service


def _to_read_dict(db: Session, p: Project) -> dict:
    cs = db.get(ClassSubject, p.class_subject_id)
    subject = db.get(Subject, cs.subject_id) if cs else None
    cls = db.get(SchoolClass, cs.class_id) if cs else None
    creator = db.get(User, p.created_by_user_id) if p.created_by_user_id else None
    eligible = (
        db.execute(
            select(func.count(Student.id))
            .join(Section, Student.section_id == Section.id)
            .where(
                Section.class_id == (cs.class_id if cs else 0),
                Student.is_active.is_(True),
            )
        ).scalar_one()
        if cs
        else 0
    )
    progress = db.execute(
        select(func.count(ProjectProgress.id)).where(
            ProjectProgress.project_id == p.id,
        )
    ).scalar_one()
    return {
        "id": p.id,
        "class_subject_id": p.class_subject_id,
        "class_name": cls.name if cls else None,
        "subject_name": subject.name if subject else None,
        "subject_code": subject.code if subject else None,
        "title": p.title,
        "description": p.description,
        "attachment_url": p.attachment_url,
        "deadline": p.deadline,
        "kind": p.kind,
        "created_by_user_id": p.created_by_user_id,
        "created_by_name": creator.full_name if creator else None,
        "created_at": p.created_at,
        "is_past_due": p.deadline < date.today(),
        "progress_count": int(progress),
        "eligible_student_count": int(eligible),
        "attachments": attachment_service.read_for(db, "project", p.id),
    }


def _progress_dict(db: Session, pp: ProjectProgress) -> dict:
    student = db.get(Student, pp.student_id)
    reviewer = (
        db.get(User, pp.reviewed_by_user_id) if pp.reviewed_by_user_id else None
    )
    return {
        "id": pp.id,
        "project_id": pp.project_id,
        "student_id": pp.student_id,
        "student_name": student.full_name if student else None,
        "student_admission_no": student.admission_no if student else None,
        "status": pp.status,
        "attachment_url": pp.attachment_url,
        "comment": pp.comment,
        "submitted_at": pp.submitted_at,
        "teacher_remark": pp.teacher_remark,
        "rating": pp.rating,
        "reviewed_by_name": reviewer.full_name if reviewer else None,
        "reviewed_at": pp.reviewed_at,
        "updated_at": pp.updated_at,
        "review_files": attachment_service.read_for(db, "project_review", pp.id),
    }


# ----- Teacher: create / list / edit / delete -----

def _check_teacher_owns_cs(
    db: Session, teacher_user_id: int, class_subject_id: int, school_id: int
) -> ClassSubject:
    cs = db.get(ClassSubject, class_subject_id)
    if not cs or cs.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Class-subject not found"
        )
    if cs.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't teach this subject in this class",
        )
    return cs


def create(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    data: ProjectCreate,
) -> Project:
    _check_teacher_owns_cs(db, teacher_user_id, data.class_subject_id, school_id)
    if data.deadline < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="deadline cannot be in the past",
        )
    p = Project(
        tenant_id=tenant_id,
        school_id=school_id,
        class_subject_id=data.class_subject_id,
        title=data.title.strip(),
        description=data.description.strip(),
        attachment_url=data.attachment_url,
        deadline=data.deadline,
        kind=data.kind,
        created_by_user_id=teacher_user_id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    if data.notify_parents:
        _notify_parents(db, tenant_id, school_id, p, teacher_user_id)
    return p


def _notify_parents(
    db: Session, tenant_id: int, school_id: int, p: Project, teacher_user_id: int
) -> None:
    from app.services import notice_service

    cs = db.get(ClassSubject, p.class_subject_id)
    if not cs:
        return
    n = Notice(
        tenant_id=tenant_id,
        school_id=school_id,
        title=f"New project: {p.title}",
        body=f"{p.title}\nDeadline: {p.deadline.isoformat()}\n\n{p.description[:500]}",
        audience=NoticeAudience.class_parents,
        audience_class_id=cs.class_id,
        channels=[NoticeChannel.in_app.value],
        attachment_url=p.attachment_url,
        status=NoticeStatus.draft,
        created_by_user_id=teacher_user_id,
    )
    db.add(n)
    db.flush()
    try:
        notice_service.send(db, n.id, school_id)
    except HTTPException:
        pass


def list_for_teacher(
    db: Session, teacher_user_id: int, school_id: int
) -> list[Project]:
    return list(
        db.execute(
            select(Project)
            .join(ClassSubject, Project.class_subject_id == ClassSubject.id)
            .where(
                Project.school_id == school_id,
                ClassSubject.teacher_user_id == teacher_user_id,
            )
            .order_by(Project.deadline.desc(), Project.created_at.desc())
        ).scalars().all()
    )


def get(db: Session, project_id: int, school_id: int) -> Project:
    p = db.get(Project, project_id)
    if not p or p.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return p


def update(
    db: Session,
    project_id: int,
    school_id: int,
    teacher_user_id: int,
    data: ProjectUpdate,
) -> Project:
    p = get(db, project_id, school_id)
    if p.created_by_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who created this can edit it",
        )
    updates = data.model_dump(exclude_unset=True)
    for k, v in updates.items():
        if k in ("title", "description") and isinstance(v, str):
            v = v.strip()
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


def delete(
    db: Session, project_id: int, school_id: int, teacher_user_id: int
) -> None:
    p = get(db, project_id, school_id)
    if p.created_by_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who created this can delete it",
        )
    attachment_service.remove_all(db, "project", [p.id])
    attachment_service.remove_all(db, "project_review", db.execute(
        select(ProjectProgress.id).where(ProjectProgress.project_id == p.id)
    ).scalars())
    db.delete(p)
    db.commit()


# ----- Teacher: progress roster + review -----

def teacher_progress_roster(
    db: Session, project_id: int, teacher_user_id: int, school_id: int
) -> list[ProjectProgress]:
    p = get(db, project_id, school_id)
    cs = db.get(ClassSubject, p.class_subject_id)
    if not cs or cs.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't teach this project's class-subject",
        )
    # All students in the class with their progress (left join)
    students = db.execute(
        select(Student)
        .join(Section, Student.section_id == Section.id)
        .where(
            Section.class_id == cs.class_id,
            Student.is_active.is_(True),
        )
        .order_by(Student.roll_no, Student.full_name)
    ).scalars().all()
    progress_by_student = {
        pp.student_id: pp
        for pp in db.execute(
            select(ProjectProgress).where(ProjectProgress.project_id == project_id)
        ).scalars().all()
    }
    out: list[ProjectProgress] = []
    for s in students:
        pp = progress_by_student.get(s.id)
        if pp is None:
            # Construct a transient placeholder so caller sees the full roster
            placeholder = ProjectProgress(
                tenant_id=p.tenant_id,
                school_id=p.school_id,
                project_id=p.id,
                student_id=s.id,
                status=ProjectProgressStatus.not_started,
            )
            placeholder.id = 0  # type: ignore[assignment]
            placeholder.updated_at = p.created_at  # type: ignore[assignment]
            out.append(placeholder)
        else:
            out.append(pp)
    return out


def teacher_review(
    db: Session,
    progress_id: int,
    teacher_user_id: int,
    school_id: int,
    data: ProgressReview,
) -> ProjectProgress:
    pp = teacher_progress(db, progress_id, teacher_user_id, school_id)
    pp.teacher_remark = (data.teacher_remark or "").strip() or None
    pp.rating = data.rating
    pp.reviewed_by_user_id = teacher_user_id
    pp.reviewed_at = datetime.now(timezone.utc)
    pp.status = ProjectProgressStatus.reviewed
    db.commit()
    db.refresh(pp)
    return pp


# ----- Parent: list child's projects + upsert progress -----

def _verify_parent_owns(
    db: Session, parent_user_id: int, student_id: int
) -> Student:
    link = db.execute(
        select(ParentStudent).where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not linked to this parent",
        )
    s = db.get(Student, student_id)
    if not s:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return s


def list_for_child(
    db: Session, parent_user_id: int, student_id: int
) -> list[Project]:
    student = _verify_parent_owns(db, parent_user_id, student_id)
    section = db.get(Section, student.section_id)
    if not section:
        return []
    cs_ids = list(
        db.execute(
            select(ClassSubject.id).where(ClassSubject.class_id == section.class_id)
        ).scalars().all()
    )
    if not cs_ids:
        return []
    return list(
        db.execute(
            select(Project)
            .where(
                Project.school_id == student.school_id,
                Project.class_subject_id.in_(cs_ids),
            )
            .order_by(Project.deadline.desc())
        ).scalars().all()
    )


def upsert_progress(
    db: Session,
    parent_user_id: int,
    student_id: int,
    project_id: int,
    data: ProgressUpdate,
) -> ProjectProgress:
    student = _verify_parent_owns(db, parent_user_id, student_id)
    project = db.get(Project, project_id)
    if not project or project.school_id != student.school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    cs = db.get(ClassSubject, project.class_subject_id)
    sec = db.get(Section, student.section_id)
    if not cs or not sec or cs.class_id != sec.class_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This project is not for your child's class",
        )

    pp = db.execute(
        select(ProjectProgress).where(
            ProjectProgress.project_id == project_id,
            ProjectProgress.student_id == student_id,
        )
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if pp is None:
        pp = ProjectProgress(
            tenant_id=project.tenant_id,
            school_id=project.school_id,
            project_id=project_id,
            student_id=student_id,
            status=data.status or ProjectProgressStatus.in_progress,
            attachment_url=data.attachment_url,
            comment=(data.comment or "").strip() or None,
            updated_by_user_id=parent_user_id,
            submitted_at=now if (data.status == ProjectProgressStatus.submitted) else None,
        )
        db.add(pp)
    else:
        was_reviewed = pp.status == ProjectProgressStatus.reviewed
        if data.status is not None:
            pp.status = data.status
            if data.status == ProjectProgressStatus.submitted:
                pp.submitted_at = now
        elif was_reviewed:
            # Parent edited without changing status — bump out of "reviewed"
            pp.status = ProjectProgressStatus.submitted
        if data.attachment_url is not None:
            pp.attachment_url = data.attachment_url
        if data.comment is not None:
            pp.comment = data.comment.strip() or None
        pp.updated_by_user_id = parent_user_id
        # Any parent edit invalidates the teacher's previous review
        pp.teacher_remark = None
        pp.rating = None
        pp.reviewed_by_user_id = None
        pp.reviewed_at = None
    db.commit()
    db.refresh(pp)
    return pp


def get_progress_for_child(
    db: Session, parent_user_id: int, student_id: int, project_id: int
) -> Optional[ProjectProgress]:
    _verify_parent_owns(db, parent_user_id, student_id)
    return db.execute(
        select(ProjectProgress).where(
            ProjectProgress.project_id == project_id,
            ProjectProgress.student_id == student_id,
        )
    ).scalar_one_or_none()


def teacher_progress(
    db: Session, progress_id: int, teacher_user_id: int, school_id: int
) -> ProjectProgress:
    """A progress row the teacher may see: they teach the project's class-subject."""
    pp = db.get(ProjectProgress, progress_id)
    if not pp or pp.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Progress not found"
        )
    project = db.get(Project, pp.project_id)
    cs = db.get(ClassSubject, project.class_subject_id) if project else None
    if not cs or cs.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't teach this project's class-subject",
        )
    return pp


# ----- Uploaded files -----

def _own_project(db: Session, project_id: int, user: User) -> Project:
    p = get(db, project_id, user.school_id)
    if p.created_by_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who created this can change its files",
        )
    return p


def teacher_add_files(db: Session, project_id: int, user: User, files) -> Project:
    p = _own_project(db, project_id, user)
    attachment_service.add(db, kind="project", owner_id=p.id, tenant_id=p.tenant_id,
                           school_id=p.school_id, user_id=user.id, files=files)
    return p


def teacher_remove_file(db: Session, project_id: int, user: User, attachment_id: int) -> Project:
    p = _own_project(db, project_id, user)
    attachment_service.remove(db, attachment_service.get(db, "project", p.id, attachment_id))
    return p


def teacher_add_review_files(db: Session, progress_id: int, user: User, files) -> ProjectProgress:
    pp = teacher_progress(db, progress_id, user.id, user.school_id)
    attachment_service.add(db, kind="project_review", owner_id=pp.id, tenant_id=pp.tenant_id,
                           school_id=pp.school_id, user_id=user.id, files=files)
    db.refresh(pp)
    return pp


def teacher_remove_review_file(db: Session, progress_id: int, user: User,
                               attachment_id: int) -> ProjectProgress:
    pp = teacher_progress(db, progress_id, user.id, user.school_id)
    attachment_service.remove(db, attachment_service.get(db, "project_review", pp.id, attachment_id))
    db.refresh(pp)
    return pp


def parent_file(db: Session, parent_user_id: int, student_id: int, project_id: int, attachment_id: int):
    """The project brief's files, or the teacher's review files on this child's work."""
    student = _verify_parent_owns(db, parent_user_id, student_id)
    project = db.get(Project, project_id)
    cs = db.get(ClassSubject, project.class_subject_id) if project else None
    sec = db.get(Section, student.section_id)
    if not project or project.school_id != student.school_id or not cs or not sec or cs.class_id != sec.class_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    try:
        return attachment_service.get(db, "project", project.id, attachment_id)
    except HTTPException:
        pass
    pp = get_progress_for_child(db, parent_user_id, student_id, project_id)
    if not pp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return attachment_service.get(db, "project_review", pp.id, attachment_id)
