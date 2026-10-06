"""Exam operations: the datesheet, the halls, the duty roster, admit cards,
component marks and the promotion decision.

Who may do what follows who is accountable for it rather than who is senior.
The office arranges rooms and prints cards. A teacher enters the marks for a
paper they own, including its practical, which is why component entry is open
to them and hall allocation is not.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, ExamSetup, ExamStaff
from app.database import get_db
from app.schemas.exam_ops import (
    Allocation,
    AllocateIn,
    AdmitCard,
    AssignInvigilatorIn,
    AvailableStaff,
    ComponentMarks,
    Components,
    ComponentsIn,
    Datesheet,
    DutyRoster,
    ExamDashboard,
    ExamRoom,
    Invigilators,
    MoveStudentIn,
    PromotionPreview,
    SaveComponentMarksIn,
)
from app.services import exam_ops_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


# Literal paths are declared before the ones that start with {exam_id}.
# FastAPI matches in order, so "/rooms" declared after "/{exam_id}/..." would
# try to read "rooms" as an exam id and fail with a validation error rather
# than falling through to the route that was meant.



# ----- paper-level: halls, duty, components -----


@router.get("/rooms", response_model=list[ExamRoom],
            summary="Rooms a paper can be sat in")
def rooms(user: ExamStaff, db: Db):
    return exam_ops_service.exam_rooms(db, user.school_id)


@router.get("/papers/{paper_id}/allocation", response_model=Allocation,
            summary="Who sits where for one paper")
def allocation(paper_id: int, user: ExamStaff, db: Db):
    return exam_ops_service.allocation(db, user.school_id, paper_id)


@router.post("/papers/{paper_id}/allocation", response_model=Allocation,
             summary="Fill the chosen rooms, in order")
def allocate(paper_id: int, payload: AllocateIn, user: ExamSetup, db: Db):
    return exam_ops_service.auto_allocate(db, user.school_id, paper_id, payload.room_ids)


@router.delete("/papers/{paper_id}/allocation", response_model=Allocation,
               summary="Empty the seating plan for one paper")
def clear_allocation(paper_id: int, user: ExamSetup, db: Db):
    return exam_ops_service.clear_allocation(db, user.school_id, paper_id)


@router.post("/papers/{paper_id}/allocation/move", response_model=Allocation,
             summary="Move one child to another room")
def move_student(paper_id: int, payload: MoveStudentIn, user: ExamSetup, db: Db):
    return exam_ops_service.move_student(
        db, user.school_id, paper_id, payload.student_id, payload.room_id
    )


@router.get("/papers/{paper_id}/invigilators", response_model=Invigilators,
            summary="Who is watching which room")
def invigilators(paper_id: int, user: ExamStaff, db: Db):
    return exam_ops_service.invigilators(db, user.school_id, paper_id)


@router.get("/papers/{paper_id}/invigilators/available",
            response_model=list[AvailableStaff],
            summary="Staff who could watch it, and who is already busy")
def available(paper_id: int, user: ExamStaff, db: Db):
    return exam_ops_service.available_invigilators(db, user.school_id, paper_id)


@router.post("/papers/{paper_id}/invigilators", response_model=Invigilators,
             status_code=status.HTTP_201_CREATED,
             summary="Put somebody on duty")
def assign(paper_id: int, payload: AssignInvigilatorIn, user: ExamSetup, db: Db):
    return exam_ops_service.assign_invigilator(
        db, user.school_id, paper_id, payload.room_id, payload.user_id, payload.is_chief
    )


@router.delete("/papers/{paper_id}/invigilators/{invigilation_id}",
               response_model=Invigilators, summary="Take somebody off duty")
def unassign(paper_id: int, invigilation_id: int, user: ExamSetup, db: Db):
    return exam_ops_service.remove_invigilator(db, user.school_id, paper_id, invigilation_id)


@router.get("/papers/{paper_id}/components", response_model=Components,
            summary="The parts a paper is marked in")
def components(paper_id: int, user: CurrentUser, db: Db):
    return exam_ops_service.components(db, user.school_id, paper_id)


@router.put("/papers/{paper_id}/components", response_model=Components,
            summary="Define the parts; they must add up to the paper")
def set_components(paper_id: int, payload: ComponentsIn, user: ExamSetup, db: Db):
    return exam_ops_service.set_components(
        db, user.school_id, paper_id, [c.model_dump() for c in payload.components]
    )


@router.get("/papers/{paper_id}/component-marks", response_model=ComponentMarks,
            summary="The part-by-part grid for a paper")
def component_marks(paper_id: int, user: CurrentUser, db: Db):
    return exam_ops_service.component_marks(db, user.school_id, paper_id)


@router.put("/papers/{paper_id}/component-marks", response_model=ComponentMarks,
            summary="Record the parts; the total follows from them")
def save_component_marks(paper_id: int, payload: SaveComponentMarksIn,
                         user: CurrentUser, db: Db):
    return exam_ops_service.save_component_marks(
        db, user.school_id, paper_id, user.id, [r.model_dump() for r in payload.rows]
    )

# ----- exam-level: roster, cards, promotion, dashboard -----


@router.get("/{exam_id}/duty-roster", response_model=DutyRoster,
            summary="Every duty in the exam, per person")
def duty_roster(exam_id: int, user: ExamStaff, db: Db):
    return exam_ops_service.duty_roster(db, user.school_id, exam_id)


@router.get("/{exam_id}/admit-cards/{student_id}", response_model=AdmitCard,
            summary="One child's admit card")
def admit_card(exam_id: int, student_id: int, user: ExamStaff, db: Db):
    return exam_ops_service.admit_card(db, user.school_id, exam_id, student_id)


@router.get("/{exam_id}/admit-cards", response_model=list[AdmitCard],
            summary="Every card for a class, for the print run")
def admit_cards(exam_id: int, user: ExamStaff, db: Db,
                class_id: int = Query(...)):
    return exam_ops_service.admit_cards_for_class(db, user.school_id, exam_id, class_id)


@router.get("/{exam_id}/admit-cards/{student_id}/pdf",
            summary="One child's admit card, as a sheet of paper")
def admit_card_pdf(exam_id: int, student_id: int, user: ExamStaff, db: Db):
    body, name = exam_ops_service.admit_card_pdf(db, user.school_id, exam_id, student_id)
    return Response(
        body, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/{exam_id}/promotion-preview", response_model=PromotionPreview,
            summary="What the results suggest should happen to each child")
def promotion_preview(exam_id: int, user: ExamStaff, db: Db):
    return exam_ops_service.promotion_preview(db, user.school_id, exam_id)


@router.get("/{exam_id}/dashboard", response_model=ExamDashboard,
            summary="Readiness of one exam, as a checklist")
def dashboard(exam_id: int, user: ExamStaff, db: Db):
    return exam_ops_service.dashboard(db, user.school_id, exam_id)


@router.get("/{exam_id}/datesheet", response_model=Datesheet,
            summary="Every paper by day, with any clashes")
def datesheet(exam_id: int, user: ExamStaff, db: Db):
    return exam_ops_service.datesheet(db, user.school_id, exam_id)
