"""Recruitment and leave entitlement (school admin / principal)."""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core import storage
from app.core.deps import CurrentUser, SchoolAdminUser
from app.core.enums import ApplicationStage, OpeningStatus, UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.hr import (
    AllotIn,
    AllotResult,
    ApplicationIn,
    ApplicationRead,
    BalanceAdjustIn,
    BalanceRead,
    CandidateIn,
    CandidateRead,
    FeedbackIn,
    HireIn,
    HireResult,
    InterviewIn,
    InterviewRead,
    LeaveTypeIn,
    LeaveTypeRead,
    OfferIn,
    OfferRead,
    OfferRespondIn,
    OpeningIn,
    OpeningRead,
    Pipeline,
    StageIn,
)
from app.services import hr_service as svc


def _hr_staff(current_user: CurrentUser) -> User:
    if current_user.role not in (UserRole.school_admin, UserRole.principal) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Hr = Annotated[User, Depends(_hr_staff)]


# ---------- openings ----------


@router.get("/openings", response_model=list[OpeningRead])
def list_openings(current_user: Hr, db: Db, status_: Optional[OpeningStatus] = Query(None, alias="status")):
    return svc.openings_to_read(db, svc.list_openings(db, current_user.school_id, status_))


@router.post("/openings", response_model=OpeningRead, status_code=status.HTTP_201_CREATED)
def create_opening(payload: OpeningIn, current_user: SchoolAdminUser, db: Db):
    return svc.openings_to_read(db, [svc.create_opening(db, current_user, payload)])[0]


@router.get("/openings/{opening_id}", response_model=OpeningRead)
def get_opening(opening_id: int, current_user: Hr, db: Db):
    return svc.openings_to_read(db, [svc.get_opening(db, opening_id, current_user.school_id)])[0]


@router.put("/openings/{opening_id}", response_model=OpeningRead)
def update_opening(opening_id: int, payload: OpeningIn, current_user: SchoolAdminUser, db: Db):
    return svc.openings_to_read(db, [svc.update_opening(db, current_user, opening_id, payload)])[0]


@router.post("/openings/{opening_id}/status", response_model=OpeningRead, summary="Open, hold, close or mark filled")
def set_status(opening_id: int, current_user: SchoolAdminUser, db: Db, value: OpeningStatus = Query(...)):
    return svc.openings_to_read(db, [svc.set_opening_status(db, current_user, opening_id, value)])[0]


@router.delete("/openings/{opening_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_opening(opening_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete_opening(db, current_user, opening_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/pipeline", response_model=Pipeline)
def pipeline(current_user: Hr, db: Db):
    return svc.pipeline(db, current_user.school_id)


# ---------- candidates ----------


@router.get("/candidates", response_model=list[CandidateRead])
def list_candidates(current_user: Hr, db: Db, search: Optional[str] = None):
    return [svc.candidate_to_read(db, c) for c in svc.list_candidates(db, current_user.school_id, search)]


@router.post("/candidates", response_model=CandidateRead, status_code=status.HTTP_201_CREATED)
def create_candidate(payload: CandidateIn, current_user: Hr, db: Db):
    c = svc.upsert_candidate(db, current_user.tenant_id, current_user.school_id, payload)
    db.commit()
    return svc.candidate_to_read(db, c)


@router.post("/candidates/{candidate_id}/resume", response_model=CandidateRead)
def upload_resume(candidate_id: int, current_user: Hr, db: Db, file: UploadFile = File(...)):
    return svc.candidate_to_read(db, svc.save_resume(db, current_user, candidate_id, file))


@router.get("/candidates/{candidate_id}/resume")
def download_resume(candidate_id: int, current_user: Hr, db: Db):
    c = svc.get_candidate(db, candidate_id, current_user.school_id)
    if not c.resume_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No résumé on file")
    return Response(
        content=storage.read(c.resume_key),
        media_type="application/octet-stream",
        headers={"Content-Disposition": storage.content_disposition(c.resume_name or "resume", inline=False)},
    )


# ---------- applications ----------


@router.get("/applications", response_model=list[ApplicationRead])
def list_applications(current_user: Hr, db: Db, opening_id: Optional[int] = None,
                      stage: Optional[ApplicationStage] = None, candidate_id: Optional[int] = None):
    items = svc.list_applications(db, current_user.school_id, opening_id, stage, candidate_id)
    return svc.applications_to_read(db, items)


@router.post("/applications", response_model=ApplicationRead, status_code=status.HTTP_201_CREATED)
def create_application(payload: ApplicationIn, current_user: Hr, db: Db):
    a = svc.apply(db, current_user.tenant_id, current_user.school_id, payload.opening_id, payload.candidate, payload.notes)
    return svc.applications_to_read(db, [a], with_detail=True)[0]


@router.get("/applications/{application_id}", response_model=ApplicationRead)
def get_application(application_id: int, current_user: Hr, db: Db):
    a = svc.get_application(db, application_id, current_user.school_id)
    return svc.applications_to_read(db, [a], with_detail=True)[0]


@router.post("/applications/{application_id}/stage", response_model=ApplicationRead)
def move_stage(application_id: int, payload: StageIn, current_user: Hr, db: Db):
    a = svc.move_stage(db, current_user, application_id, payload)
    return svc.applications_to_read(db, [a], with_detail=True)[0]


@router.post("/applications/{application_id}/interviews", response_model=ApplicationRead,
             status_code=status.HTTP_201_CREATED)
def schedule_interview(application_id: int, payload: InterviewIn, current_user: Hr, db: Db):
    svc.schedule_interview(db, current_user, application_id, payload)
    a = svc.get_application(db, application_id, current_user.school_id)
    return svc.applications_to_read(db, [a], with_detail=True)[0]


@router.put("/interviews/{interview_id}", response_model=InterviewRead, summary="Record the panel's feedback")
def feedback(interview_id: int, payload: FeedbackIn, current_user: Hr, db: Db):
    i = svc.interview_feedback(db, current_user, interview_id, payload)
    return dict(id=i.id, round_no=i.round_no, scheduled_at=i.scheduled_at, minutes=i.minutes, mode=i.mode,
                place_or_link=i.place_or_link, panel_user_ids=i.panel_user_ids or [], panel_names=[],
                status=i.status, feedback=i.feedback, rating=i.rating, recommended=i.recommended)


@router.delete("/interviews/{interview_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_interview(interview_id: int, current_user: Hr, db: Db):
    svc.cancel_interview(db, current_user, interview_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- offers ----------


@router.post("/applications/{application_id}/offer", response_model=ApplicationRead, status_code=status.HTTP_201_CREATED)
def create_offer(application_id: int, payload: OfferIn, current_user: SchoolAdminUser, db: Db):
    svc.create_offer(db, current_user, application_id, payload)
    a = svc.get_application(db, application_id, current_user.school_id)
    return svc.applications_to_read(db, [a], with_detail=True)[0]


@router.post("/offers/{offer_id}/send", response_model=OfferRead)
def send_offer(offer_id: int, current_user: SchoolAdminUser, db: Db):
    return svc.send_offer(db, current_user, offer_id)


@router.post("/offers/{offer_id}/respond", response_model=OfferRead, summary="Record the candidate's answer")
def respond(offer_id: int, payload: OfferRespondIn, current_user: Hr, db: Db):
    return svc.respond_to_offer(db, current_user, offer_id, payload)


@router.post("/offers/{offer_id}/withdraw", response_model=OfferRead)
def withdraw(offer_id: int, current_user: SchoolAdminUser, db: Db, note: Optional[str] = None):
    return svc.withdraw_offer(db, current_user, offer_id, note)


@router.post("/offers/{offer_id}/hire", response_model=HireResult, summary="Create the staff member and their login")
def hire(offer_id: int, payload: HireIn, current_user: SchoolAdminUser, db: Db):
    return svc.hire(db, current_user, offer_id, payload.employee_no, payload.role)


# ---------- leave types & balances ----------


@router.get("/leave-types", response_model=list[LeaveTypeRead])
def list_types(current_user: Hr, db: Db):
    return svc.list_leave_types(db, current_user.school_id)


@router.post("/leave-types", response_model=LeaveTypeRead, status_code=status.HTTP_201_CREATED)
def create_type(payload: LeaveTypeIn, current_user: SchoolAdminUser, db: Db):
    return svc.create_leave_type(db, current_user, payload)


@router.put("/leave-types/{type_id}", response_model=LeaveTypeRead)
def update_type(type_id: int, payload: LeaveTypeIn, current_user: SchoolAdminUser, db: Db):
    return svc.update_leave_type(db, current_user, type_id, payload)


@router.delete("/leave-types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_type(type_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete_leave_type(db, current_user, type_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/leave-balances", response_model=list[BalanceRead])
def balances(current_user: Hr, db: Db, year: Optional[int] = None, user_id: Optional[int] = None):
    return svc.balances(db, current_user.school_id, year or date.today().year, user_id)


@router.post("/leave-balances/allot", response_model=AllotResult, summary="Give every staff member this year's leave")
def allot(payload: AllotIn, current_user: SchoolAdminUser, db: Db):
    return svc.allot_year(db, current_user, payload.year, payload.carry_forward)


@router.patch("/leave-balances/{balance_id}", response_model=BalanceRead)
def adjust(balance_id: int, payload: BalanceAdjustIn, current_user: SchoolAdminUser, db: Db):
    b = svc.adjust_balance(db, current_user, balance_id, payload)
    return svc.balances(db, current_user.school_id, b.year, b.user_id)[0]
