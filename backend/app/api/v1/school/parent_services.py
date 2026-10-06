"""School side of the parent services: approve parents' requests, answer the
office help desk, run feedback surveys, record achievements and project
milestones, publish the canteen menu and the school's contact hours.

Each kind of request goes to the job that owns it: linking children and
contact details to the school office, transport changes to the transport
manager, renewals to the library."""
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import (
    FrontDeskUser,
    LibraryManager,
    ParentsManager,
    SchoolAdminOrPrincipal,
    SchoolAdminUser,
    TransportManager,
    allow,
)
from app.core.enums import UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.parent_services import (
    AchievementIn,
    AchievementRead,
    AchievementUpdate,
    CanteenMenuIn,
    MenuSlotRead,
    MilestoneIn,
    MilestoneRead,
    ParentRequestRead,
    RequestDecision,
    ServiceSettingsIn,
    ServiceSettingsRead,
    SurveyIn,
    SurveyRead,
    SurveyResults,
    SurveyStatusIn,
    TicketRead,
    TicketReplyIn,
    TicketStatusIn,
)
from app.services import parent_services_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]

# Class and subject teachers record achievements and milestones for the
# students and projects they teach (checked in the service).
Educator = Annotated[User, Depends(allow(UserRole.school_admin, UserRole.principal, UserRole.teacher))]
MenuKeeper = Annotated[User, Depends(allow(UserRole.school_admin, UserRole.principal, permission="hostel.manage"))]

OFFICE_KINDS = ("link_child", "contact_change")


def _req(db, r) -> ParentRequestRead:
    return ParentRequestRead.model_validate(svc.request_read(db, r, school_side=True))


# ---------- contact hours ----------


@router.get("/settings", response_model=ServiceSettingsRead)
def get_settings(current_user: FrontDeskUser, db: Db):
    return ServiceSettingsRead.model_validate(svc.settings_read(db, current_user.school_id))


@router.put("/settings", response_model=ServiceSettingsRead, summary="Communication hours and office help desk details")
def put_settings(payload: ServiceSettingsIn, current_user: SchoolAdminUser, db: Db):
    return ServiceSettingsRead.model_validate(svc.put_settings(db, current_user, payload))


# ---------- requests ----------


@router.get("/requests", response_model=list[ParentRequestRead],
            summary="Parents' requests to link a child or change their contact details")
def office_requests(
    current_user: ParentsManager,
    db: Db,
    kind: Optional[Literal["link_child", "contact_change"]] = None,
    status_filter: Optional[Literal["pending", "approved", "rejected", "cancelled"]] = Query(None, alias="status"),
):
    kinds = (kind,) if kind else OFFICE_KINDS
    return [_req(db, r) for r in svc.school_requests(db, current_user.school_id, kinds, status_filter=status_filter)]


@router.post("/requests/{request_id}/decide", response_model=ParentRequestRead,
             summary="Approve (links the child / changes the contact details) or reject")
def decide_office(request_id: int, payload: RequestDecision, current_user: ParentsManager, db: Db):
    return _req(db, svc.decide_request(db, current_user, request_id, OFFICE_KINDS, payload))


@router.get("/transport-requests", response_model=list[ParentRequestRead])
def transport_requests(
    current_user: TransportManager,
    db: Db,
    status_filter: Optional[Literal["pending", "approved", "rejected", "cancelled"]] = Query(None, alias="status"),
):
    return [_req(db, r) for r in svc.school_requests(db, current_user.school_id, ("transport_change",), status_filter=status_filter)]


@router.post("/transport-requests/{request_id}/decide", response_model=ParentRequestRead,
             summary="Approve (moves or ends the child's transport assignment) or reject")
def decide_transport(request_id: int, payload: RequestDecision, current_user: TransportManager, db: Db):
    return _req(db, svc.decide_request(db, current_user, request_id, ("transport_change",), payload))


@router.get("/library-renewals", response_model=list[ParentRequestRead])
def library_renewals(
    current_user: LibraryManager,
    db: Db,
    status_filter: Optional[Literal["pending", "approved", "rejected", "cancelled"]] = Query(None, alias="status"),
):
    return [_req(db, r) for r in svc.school_requests(db, current_user.school_id, ("library_renewal",), status_filter=status_filter)]


@router.post("/library-renewals/{request_id}/decide", response_model=ParentRequestRead,
             summary="Approve (renews the loan under the library's rules) or reject")
def decide_renewal(request_id: int, payload: RequestDecision, current_user: LibraryManager, db: Db):
    return _req(db, svc.decide_request(db, current_user, request_id, ("library_renewal",), payload))


# ---------- help desk ----------


@router.get("/help-tickets", response_model=list[TicketRead], summary="Parents' requests to the school office")
def tickets(
    current_user: FrontDeskUser,
    db: Db,
    status_filter: Optional[Literal["open", "in_progress", "resolved"]] = Query(None, alias="status"),
):
    return [TicketRead.model_validate(svc.ticket_read(db, t)) for t in svc.school_tickets(db, current_user.school_id, status_filter)]


@router.get("/help-tickets/{ticket_id}", response_model=TicketRead)
def ticket(ticket_id: int, current_user: FrontDeskUser, db: Db):
    return TicketRead.model_validate(svc.ticket_read(db, svc.school_ticket(db, current_user.school_id, ticket_id), with_replies=True))


@router.post("/help-tickets/{ticket_id}/replies", response_model=TicketRead)
def reply(ticket_id: int, payload: TicketReplyIn, current_user: FrontDeskUser, db: Db):
    return TicketRead.model_validate(svc.ticket_read(db, svc.school_reply(db, current_user, ticket_id, payload.body), with_replies=True))


@router.post("/help-tickets/{ticket_id}/status", response_model=TicketRead)
def ticket_status(ticket_id: int, payload: TicketStatusIn, current_user: FrontDeskUser, db: Db):
    t = svc.school_set_ticket_status(db, current_user, ticket_id, payload.status)
    return TicketRead.model_validate(svc.ticket_read(db, t, with_replies=True))


# ---------- surveys ----------


@router.get("/surveys", response_model=list[SurveyRead])
def surveys(current_user: SchoolAdminOrPrincipal, db: Db):
    return [SurveyRead.model_validate(svc.survey_read(db, s, school_side=True)) for s in svc.school_surveys(db, current_user.school_id)]


@router.post("/surveys", response_model=SurveyRead, status_code=status.HTTP_201_CREATED)
def create_survey(payload: SurveyIn, current_user: SchoolAdminOrPrincipal, db: Db):
    return SurveyRead.model_validate(svc.survey_read(db, svc.create_survey(db, current_user, payload), school_side=True))


@router.put("/surveys/{survey_id}", response_model=SurveyRead)
def update_survey(survey_id: int, payload: SurveyIn, current_user: SchoolAdminOrPrincipal, db: Db):
    return SurveyRead.model_validate(svc.survey_read(db, svc.update_survey(db, current_user, survey_id, payload), school_side=True))


@router.post("/surveys/{survey_id}/status", response_model=SurveyRead, summary="Open, close or return a survey to draft")
def survey_status(survey_id: int, payload: SurveyStatusIn, current_user: SchoolAdminOrPrincipal, db: Db):
    return SurveyRead.model_validate(svc.survey_read(db, svc.set_survey_status(db, current_user, survey_id, payload.status), school_side=True))


@router.delete("/surveys/{survey_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_survey(survey_id: int, current_user: SchoolAdminOrPrincipal, db: Db):
    svc.delete_survey(db, current_user, survey_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/surveys/{survey_id}/results", response_model=SurveyResults)
def survey_results(survey_id: int, current_user: SchoolAdminOrPrincipal, db: Db):
    return SurveyResults.model_validate(svc.survey_results(db, current_user, survey_id))


# ---------- achievements ----------


@router.get("/achievements", response_model=list[AchievementRead])
def achievements(student_id: int, current_user: Educator, db: Db):
    return [AchievementRead.model_validate(svc.achievement_read(db, a)) for a in svc.staff_achievements(db, current_user, student_id)]


@router.post("/achievements", response_model=AchievementRead, status_code=status.HTTP_201_CREATED)
def create_achievement(payload: AchievementIn, current_user: Educator, db: Db):
    return AchievementRead.model_validate(svc.achievement_read(db, svc.create_achievement(db, current_user, payload)))


@router.patch("/achievements/{achievement_id}", response_model=AchievementRead)
def update_achievement(achievement_id: int, payload: AchievementUpdate, current_user: Educator, db: Db):
    return AchievementRead.model_validate(svc.achievement_read(db, svc.update_achievement(db, current_user, achievement_id, payload)))


@router.delete("/achievements/{achievement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_achievement(achievement_id: int, current_user: Educator, db: Db):
    svc.delete_achievement(db, current_user, achievement_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- project milestones ----------


@router.get("/projects/{project_id}/milestones", response_model=list[MilestoneRead])
def milestones(project_id: int, current_user: Educator, db: Db):
    return [MilestoneRead.model_validate(svc.milestone_read(m)) for m in svc.staff_milestones(db, current_user, project_id)]


@router.post("/projects/{project_id}/milestones", response_model=MilestoneRead, status_code=status.HTTP_201_CREATED)
def add_milestone(project_id: int, payload: MilestoneIn, current_user: Educator, db: Db):
    return MilestoneRead.model_validate(svc.milestone_read(svc.add_milestone(db, current_user, project_id, payload)))


@router.delete("/projects/{project_id}/milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_milestone(project_id: int, milestone_id: int, current_user: Educator, db: Db):
    svc.delete_milestone(db, current_user, project_id, milestone_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- canteen menu ----------


@router.get("/canteen-menu", response_model=list[MenuSlotRead])
def canteen_menu(current_user: MenuKeeper, db: Db):
    return [MenuSlotRead(day_of_week=m.day_of_week, meal=m.meal, items=m.items) for m in svc.canteen_menu(db, current_user.school_id)]


@router.put("/canteen-menu", response_model=list[MenuSlotRead], summary="Replace the day-school canteen's weekly menu")
def set_canteen_menu(payload: CanteenMenuIn, current_user: MenuKeeper, db: Db):
    return [MenuSlotRead(day_of_week=m.day_of_week, meal=m.meal, items=m.items) for m in svc.set_canteen_menu(db, current_user, payload)]
