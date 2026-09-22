from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import NotificationCategory
from app.core.enums import (
    NoticeAudience,
    NoticeChannel,
    NoticeStatus,
    SubmissionStatus,
)
from app.models.academic import SchoolClass, Section
from app.models.homework import Homework, HomeworkSubmission
from app.models.notice import Notice
from app.models.rubric import Rubric
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User
from app.schemas.homework import (
    HomeworkCreate,
    HomeworkUpdate,
    SubmissionCreate,
    SubmissionReview,
    SubmissionUpdate,
)
from app.services import attachment_service, rubric_service


def _check_open(h: Homework) -> None:
    """A closed assignment is finished with: no more work in, no more edits."""
    if h is not None and h.closed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This homework has been closed by the teacher",
        )


def close(db: Session, homework_id: int, school_id: int, teacher_user_id: int, *, closed: bool) -> Homework:
    """Close a homework so nothing more can be submitted, or reopen it."""
    h = get(db, homework_id, school_id)
    if h.created_by_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who posted this can close it",
        )
    if closed and h.closed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This homework is already closed"
        )
    h.closed_at = datetime.now(timezone.utc) if closed else None
    h.closed_by_user_id = teacher_user_id if closed else None
    db.commit()
    db.refresh(h)
    return h


def _to_read_dict(db: Session, h: Homework, *, viewer_id: Optional[int] = None) -> dict:
    cs = db.get(ClassSubject, h.class_subject_id)
    subject = db.get(Subject, cs.subject_id) if cs else None
    cls = db.get(SchoolClass, cs.class_id) if cs else None
    creator = db.get(User, h.created_by_user_id) if h.created_by_user_id else None
    is_past_due = h.due_date < date.today()
    can_edit = (
        viewer_id is not None
        and viewer_id == h.created_by_user_id
        and not is_past_due
        and h.closed_at is None
    )
    rubric = db.get(Rubric, h.rubric_id) if h.rubric_id else None
    closer = db.get(User, h.closed_by_user_id) if h.closed_by_user_id else None
    return {
        "id": h.id,
        "class_subject_id": h.class_subject_id,
        "subject_name": subject.name if subject else None,
        "subject_code": subject.code if subject else None,
        "class_name": cls.name if cls else None,
        "title": h.title,
        "description": h.description,
        "attachment_url": h.attachment_url,
        "due_date": h.due_date,
        "created_by_user_id": h.created_by_user_id,
        "created_by_name": creator.full_name if creator else None,
        "created_at": h.created_at,
        "is_past_due": is_past_due,
        "can_edit": can_edit,
        "rubric_id": h.rubric_id,
        "rubric_name": rubric.name if rubric else None,
        "is_closed": h.closed_at is not None,
        "closed_at": h.closed_at,
        "closed_by_name": closer.full_name if closer else None,
        "attachments": attachment_service.read_for(db, "homework", h.id),
    }


def _validate_teacher_owns_cs(
    db: Session, teacher_user_id: int, class_subject_id: int, school_id: int
) -> ClassSubject:
    cs = db.get(ClassSubject, class_subject_id)
    if not cs or cs.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class-subject not found",
        )
    if cs.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't teach this subject in this class",
        )
    return cs


def _maybe_notify_parents(
    db: Session, tenant_id: int, school_id: int, h: Homework, creator_id: int
) -> None:
    """Create a Notice to parents of the class and dispatch immediately."""
    from app.services import notice_service  # local to avoid cycle

    cs = db.get(ClassSubject, h.class_subject_id)
    subject = db.get(Subject, cs.subject_id) if cs else None
    cls = db.get(SchoolClass, cs.class_id) if cs else None
    subject_name = subject.name if subject else "Subject"

    n = Notice(
        tenant_id=tenant_id,
        school_id=school_id,
        title=f"New homework: {subject_name}",
        body=(
            f"{subject_name} — {h.title}\nDue: {h.due_date.isoformat()}\n\n"
            f"{h.description[:500]}"
            + ("…" if len(h.description) > 500 else "")
        ),
        audience=NoticeAudience.class_parents,
        audience_class_id=cls.id if cls else None,
        category=NotificationCategory.homework,
        link=f"/parent/homework-detail?id={h.id}",
        channels=[NoticeChannel.in_app.value],
        attachment_url=h.attachment_url,
        status=NoticeStatus.draft,
        created_by_user_id=creator_id,
    )
    db.add(n)
    db.flush()
    try:
        notice_service.send(db, n.id, school_id)
    except HTTPException:
        # Audience may be empty — that's fine, we don't want to fail the whole
        # homework save because of it.
        pass


def create(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    data: HomeworkCreate,
) -> Homework:
    _validate_teacher_owns_cs(db, teacher_user_id, data.class_subject_id, school_id)
    if data.due_date < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="due_date cannot be in the past",
        )
    if data.rubric_id:
        rubric_service.get(db, data.rubric_id, school_id)
    h = Homework(
        tenant_id=tenant_id,
        school_id=school_id,
        class_subject_id=data.class_subject_id,
        title=data.title.strip(),
        description=data.description.strip(),
        attachment_url=data.attachment_url,
        due_date=data.due_date,
        rubric_id=data.rubric_id,
        created_by_user_id=teacher_user_id,
    )
    db.add(h)
    db.commit()
    db.refresh(h)

    if data.notify_parents:
        _maybe_notify_parents(db, tenant_id, school_id, h, teacher_user_id)

    return h


def list_for_teacher(
    db: Session,
    teacher_user_id: int,
    school_id: int,
    *,
    class_subject_id: Optional[int] = None,
    include_past: bool = True,
    limit: int = 100,
) -> list[Homework]:
    stmt = (
        select(Homework)
        .join(ClassSubject, Homework.class_subject_id == ClassSubject.id)
        .where(
            Homework.school_id == school_id,
            ClassSubject.teacher_user_id == teacher_user_id,
        )
        .order_by(Homework.due_date.desc(), Homework.created_at.desc())
        .limit(limit)
    )
    if class_subject_id:
        stmt = stmt.where(Homework.class_subject_id == class_subject_id)
    if not include_past:
        stmt = stmt.where(Homework.due_date >= date.today())
    return list(db.execute(stmt).scalars().all())


def get(db: Session, homework_id: int, school_id: int) -> Homework:
    h = db.get(Homework, homework_id)
    if not h or h.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found"
        )
    return h


def update(
    db: Session,
    homework_id: int,
    school_id: int,
    teacher_user_id: int,
    data: HomeworkUpdate,
) -> Homework:
    h = get(db, homework_id, school_id)
    if h.created_by_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who posted this can edit it",
        )
    _check_open(h)
    if "rubric_id" in data.model_dump(exclude_unset=True) and data.rubric_id:
        rubric_service.get(db, data.rubric_id, school_id)
    if h.due_date < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit homework past its due date",
        )

    updates = data.model_dump(exclude_unset=True)
    if "due_date" in updates and updates["due_date"] < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="due_date cannot be in the past",
        )
    for field, value in updates.items():
        if field in ("title", "description") and isinstance(value, str):
            value = value.strip()
        setattr(h, field, value)
    db.commit()
    db.refresh(h)
    return h


def delete(
    db: Session, homework_id: int, school_id: int, teacher_user_id: int
) -> None:
    h = get(db, homework_id, school_id)
    if h.created_by_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who posted this can delete it",
        )
    _check_open(h)
    if h.due_date < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete homework past its due date — archive instead",
        )
    sub_ids = list(db.execute(
        select(HomeworkSubmission.id).where(HomeworkSubmission.homework_id == h.id)
    ).scalars())
    attachment_service.remove_all(db, "homework", [h.id])
    attachment_service.remove_all(db, "homework_submission", sub_ids)
    attachment_service.remove_all(db, "homework_review", sub_ids)
    db.delete(h)
    db.commit()


# ----- Parent-facing -----

def list_for_child(
    db: Session, parent_user_id: int, student_id: int
) -> list[Homework]:
    from app.models.parent import ParentStudent
    from app.models.student import Student

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

    student = db.get(Student, student_id)
    if not student:
        return []
    return list_for_student(db, student)


def list_for_student(db: Session, student: Student) -> list[Homework]:
    """Every piece of homework set for this child's class.

    Homework belongs to a class subject, so the child's section decides what
    they see. Shared by the parent portal and the child's own, because what
    was set is the same fact either way.
    """
    # Find the student's section -> class, then all class_subjects in that class.
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

    rows = db.execute(
        select(Homework)
        .where(Homework.class_subject_id.in_(cs_ids))
        .order_by(Homework.due_date.desc())
    ).scalars().all()
    return list(rows)


# ----- Story 9.3 — Submissions -----

def _verify_parent_owns_child(
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
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return student


def _verify_homework_for_student(
    db: Session, homework: Homework, student: Student
) -> None:
    """Homework's class_subject must belong to the student's current class."""
    cs = db.get(ClassSubject, homework.class_subject_id)
    section = db.get(Section, student.section_id)
    if not cs or not section or cs.class_id != section.class_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This homework is not for your child's class",
        )


def submission_to_dict(db: Session, sub: HomeworkSubmission) -> dict:
    student = db.get(Student, sub.student_id)
    submitter = (
        db.get(User, sub.submitted_by_user_id) if sub.submitted_by_user_id else None
    )
    reviewer = (
        db.get(User, sub.reviewed_by_user_id) if sub.reviewed_by_user_id else None
    )
    return {
        "id": sub.id,
        "homework_id": sub.homework_id,
        "student_id": sub.student_id,
        "student_admission_no": student.admission_no if student else None,
        "student_name": student.full_name if student else None,
        "submitted_by_user_id": sub.submitted_by_user_id,
        "submitted_by_name": submitter.full_name if submitter else None,
        "attachment_url": sub.attachment_url,
        "comment": sub.comment,
        "submitted_at": sub.submitted_at,
        "status": sub.status,
        "teacher_remark": sub.teacher_remark,
        "reviewed_by_user_id": sub.reviewed_by_user_id,
        "reviewed_by_name": reviewer.full_name if reviewer else None,
        "reviewed_at": sub.reviewed_at,
        "marking": rubric_service.marking_for(db, sub.id),
        "files": attachment_service.read_for(db, "homework_submission", sub.id),
        "review_files": attachment_service.read_for(db, "homework_review", sub.id),
    }


def parent_submit(
    db: Session,
    parent_user_id: int,
    student_id: int,
    homework_id: int,
    data: SubmissionCreate,
) -> HomeworkSubmission:
    student = _verify_parent_owns_child(db, parent_user_id, student_id)
    return submit_for_student(db, student, homework_id, data, by_user_id=parent_user_id)


def submit_for_student(
    db: Session,
    student: Student,
    homework_id: int,
    data: SubmissionCreate,
    *,
    by_user_id: int,
) -> HomeworkSubmission:
    """Record a submission against a child.

    Who is allowed to do it is settled before this is called — a parent with
    the child on their account, or the child themselves. The work itself is
    the same either way, and `submitted_by_user_id` records which of them it
    actually was, so a teacher can tell.
    """
    student_id = student.id
    hw = db.get(Homework, homework_id)
    if not hw:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found"
        )
    _verify_homework_for_student(db, hw, student)
    _check_open(hw)

    now = datetime.now(timezone.utc)
    existing = db.execute(
        select(HomeworkSubmission).where(
            HomeworkSubmission.homework_id == homework_id,
            HomeworkSubmission.student_id == student_id,
        )
    ).scalar_one_or_none()

    # Files uploaded to the submission count as handing something in.
    if not (data.attachment_url or data.comment or (existing and _has_files(db, existing.id))):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide an attachment URL or a comment",
        )

    if existing:
        # Re-submitting overwrites and resets review state
        existing.attachment_url = data.attachment_url
        existing.comment = data.comment
        existing.submitted_at = now
        existing.status = SubmissionStatus.submitted
        existing.teacher_remark = None
        existing.reviewed_by_user_id = None
        existing.reviewed_at = None
        existing.submitted_by_user_id = by_user_id
        db.commit()
        db.refresh(existing)
        return existing

    sub = HomeworkSubmission(
        tenant_id=hw.tenant_id,
        school_id=hw.school_id,
        homework_id=homework_id,
        student_id=student_id,
        submitted_by_user_id=by_user_id,
        attachment_url=data.attachment_url,
        comment=data.comment,
        submitted_at=now,
        status=SubmissionStatus.submitted,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def parent_edit_submission(
    db: Session,
    parent_user_id: int,
    student_id: int,
    homework_id: int,
    data: SubmissionUpdate,
) -> HomeworkSubmission:
    """Parents can edit only their own child's submission, which resets review."""
    _verify_parent_owns_child(db, parent_user_id, student_id)
    return edit_submission_for_student(
        db, student_id, homework_id, data, by_user_id=parent_user_id
    )


def edit_submission_for_student(
    db: Session,
    student_id: int,
    homework_id: int,
    data: SubmissionUpdate,
    *,
    by_user_id: int,
) -> HomeworkSubmission:
    """Change a submission that has already been made. Editing it puts it back
    in front of the teacher, because a reviewed remark about work that has
    since changed is worse than no remark."""
    sub = db.execute(
        select(HomeworkSubmission).where(
            HomeworkSubmission.homework_id == homework_id,
            HomeworkSubmission.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No submission to edit"
        )
    _check_open(db.get(Homework, homework_id))
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(sub, field, value)
    if not (sub.attachment_url or sub.comment or _has_files(db, sub.id)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission must have a file, an attachment URL or a comment",
        )
    sub.submitted_at = datetime.now(timezone.utc)
    sub.status = SubmissionStatus.submitted
    sub.teacher_remark = None
    sub.reviewed_by_user_id = None
    sub.reviewed_at = None
    sub.submitted_by_user_id = by_user_id
    db.commit()
    db.refresh(sub)
    return sub


def parent_get_submission(
    db: Session, parent_user_id: int, student_id: int, homework_id: int
) -> Optional[HomeworkSubmission]:
    _verify_parent_owns_child(db, parent_user_id, student_id)
    return get_submission_for_student(db, student_id, homework_id)


def get_submission_for_student(
    db: Session, student_id: int, homework_id: int
) -> Optional[HomeworkSubmission]:
    return db.execute(
        select(HomeworkSubmission).where(
            HomeworkSubmission.homework_id == homework_id,
            HomeworkSubmission.student_id == student_id,
        )
    ).scalar_one_or_none()


def teacher_list_submissions(
    db: Session, homework_id: int, teacher_user_id: int, school_id: int
) -> list[HomeworkSubmission]:
    hw = db.get(Homework, homework_id)
    if not hw or hw.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found"
        )
    cs = db.get(ClassSubject, hw.class_subject_id)
    if not cs or cs.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't teach this homework's class-subject",
        )
    return list(
        db.execute(
            select(HomeworkSubmission)
            .where(HomeworkSubmission.homework_id == homework_id)
            .order_by(HomeworkSubmission.submitted_at.desc())
        ).scalars().all()
    )


def teacher_review_submission(
    db: Session,
    submission_id: int,
    teacher_user_id: int,
    school_id: int,
    data: SubmissionReview,
) -> HomeworkSubmission:
    sub = teacher_submission(db, submission_id, teacher_user_id, school_id)
    if data.status not in (SubmissionStatus.approved, SubmissionStatus.rejected):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Review status must be approved or rejected",
        )
    sub.status = data.status
    sub.teacher_remark = data.teacher_remark
    sub.reviewed_by_user_id = teacher_user_id
    sub.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sub)
    return sub


def teacher_submission(
    db: Session, submission_id: int, teacher_user_id: int, school_id: int
) -> HomeworkSubmission:
    """A submission the teacher may see: they teach the homework's class-subject."""
    sub = db.get(HomeworkSubmission, submission_id)
    if not sub or sub.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found"
        )
    hw = db.get(Homework, sub.homework_id)
    cs = db.get(ClassSubject, hw.class_subject_id) if hw else None
    if not cs or cs.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't teach this homework's class-subject",
        )
    return sub


# ----- Uploaded files -----

SUBMISSION_FILE_KINDS = ("homework_submission", "homework_review")


def _has_files(db: Session, submission_id: int) -> bool:
    return bool(attachment_service.list_for(db, "homework_submission", submission_id))


def _own_homework(db: Session, homework_id: int, school_id: int, teacher_user_id: int) -> Homework:
    h = get(db, homework_id, school_id)
    if h.created_by_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who posted this can change its files",
        )
    _check_open(h)
    return h


def teacher_add_files(db: Session, homework_id: int, user: User, files) -> Homework:
    h = _own_homework(db, homework_id, user.school_id, user.id)
    attachment_service.add(db, kind="homework", owner_id=h.id, tenant_id=h.tenant_id,
                           school_id=h.school_id, user_id=user.id, files=files)
    return h


def teacher_remove_file(db: Session, homework_id: int, user: User, attachment_id: int) -> Homework:
    h = _own_homework(db, homework_id, user.school_id, user.id)
    attachment_service.remove(db, attachment_service.get(db, "homework", h.id, attachment_id))
    return h


def homework_for_student(db: Session, student: Student, homework_id: int) -> Homework:
    """The homework if it is set for this child's class, else 404."""
    hw = db.get(Homework, homework_id)
    if not hw or hw.school_id != student.school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
    _verify_homework_for_student(db, hw, student)
    return hw


def _reset_review(sub: HomeworkSubmission, by_user_id: int) -> None:
    sub.submitted_at = datetime.now(timezone.utc)
    sub.status = SubmissionStatus.submitted
    sub.teacher_remark = None
    sub.reviewed_by_user_id = None
    sub.reviewed_at = None
    sub.submitted_by_user_id = by_user_id


def add_submission_files(db: Session, student: Student, homework_id: int, files, *,
                         by_user_id: int) -> HomeworkSubmission:
    """Hand in files. Starts the submission if there isn't one yet; changing
    the work puts it back in front of the teacher, as an edit does."""
    hw = homework_for_student(db, student, homework_id)
    _check_open(hw)
    sub = get_submission_for_student(db, student.id, homework_id)
    if sub is None:
        sub = HomeworkSubmission(
            tenant_id=hw.tenant_id, school_id=hw.school_id, homework_id=hw.id, student_id=student.id,
            submitted_by_user_id=by_user_id, submitted_at=datetime.now(timezone.utc),
            status=SubmissionStatus.submitted,
        )
        db.add(sub)
        db.flush()
    else:
        _reset_review(sub, by_user_id)
    attachment_service.add(db, kind="homework_submission", owner_id=sub.id, tenant_id=hw.tenant_id,
                           school_id=hw.school_id, user_id=by_user_id, files=files, commit=False)
    db.commit()
    db.refresh(sub)
    return sub


def remove_submission_file(db: Session, student: Student, homework_id: int, attachment_id: int,
                           *, by_user_id: int) -> HomeworkSubmission:
    hw = homework_for_student(db, student, homework_id)
    _check_open(hw)
    sub = get_submission_for_student(db, student.id, homework_id)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No submission to edit")
    a = attachment_service.get(db, "homework_submission", sub.id, attachment_id)
    others = [x for x in attachment_service.list_for(db, "homework_submission", sub.id) if x.id != a.id]
    if not (sub.attachment_url or sub.comment or others):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This is the only thing handed in — add another file or a comment before removing it",
        )
    _reset_review(sub, by_user_id)
    attachment_service.remove(db, a)
    db.refresh(sub)
    return sub


def student_file(db: Session, student: Student, homework_id: int, attachment_id: int):
    """A file the child (or their parent) may open: the teacher's worksheet,
    the child's own submission, or the teacher's review of it."""
    hw = homework_for_student(db, student, homework_id)
    try:
        return attachment_service.get(db, "homework", hw.id, attachment_id)
    except HTTPException:
        pass
    sub = get_submission_for_student(db, student.id, homework_id)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return attachment_service.get_any(db, SUBMISSION_FILE_KINDS, sub.id, attachment_id)


def teacher_add_review_files(db: Session, submission_id: int, user: User, files) -> HomeworkSubmission:
    sub = teacher_submission(db, submission_id, user.id, user.school_id)
    attachment_service.add(db, kind="homework_review", owner_id=sub.id, tenant_id=sub.tenant_id,
                           school_id=sub.school_id, user_id=user.id, files=files)
    db.refresh(sub)
    return sub


def teacher_remove_review_file(db: Session, submission_id: int, user: User,
                               attachment_id: int) -> HomeworkSubmission:
    sub = teacher_submission(db, submission_id, user.id, user.school_id)
    attachment_service.remove(db, attachment_service.get(db, "homework_review", sub.id, attachment_id))
    db.refresh(sub)
    return sub
