"""Parent services: requests to the school (link a child, contact details,
transport, library renewal), the office help desk, feedback surveys, and
read-only extras for a linked child (achievements, activities, project
milestones, weekly subject breakdown, meal menu, route stops, counter
receipts). Every child path checks the child is linked to the signed-in
parent."""
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.parent_services import (
    AcademicYearOption,
    AchievementRead,
    ActivityMembershipRead,
    ChildMealMenu,
    ContactChangeIn,
    CounterReceiptRead,
    LibraryRenewalIn,
    LinkChildIn,
    MilestoneRead,
    ParentRequestRead,
    RouteStopRead,
    ServiceSettingsRead,
    StopOptionRead,
    SubjectWeekRead,
    SurveyAnswerIn,
    SurveyRead,
    TicketIn,
    TicketRead,
    TicketReplyIn,
    TransportChangeIn,
)
from app.services import parent_services_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


def _req(db, r) -> ParentRequestRead:
    return ParentRequestRead.model_validate(svc.request_read(db, r))


# ---------- school ----------


@router.get("/school-contact", response_model=ServiceSettingsRead,
            summary="The school's communication hours and office help desk details")
def school_contact(current_user: ParentUser, db: Db):
    return ServiceSettingsRead.model_validate(svc.settings_read(db, current_user.school_id))


@router.get("/academic-years", response_model=list[AcademicYearOption])
def academic_years(current_user: ParentUser, db: Db):
    return [AcademicYearOption.model_validate(y, from_attributes=True) for y in svc.parent_academic_years(db, current_user)]


# ---------- requests ----------


@router.get("/requests", response_model=list[ParentRequestRead], summary="My requests to the school")
def my_requests(
    current_user: ParentUser,
    db: Db,
    kind: Optional[Literal["link_child", "contact_change", "transport_change", "library_renewal"]] = None,
    student_id: Optional[int] = None,
):
    return [_req(db, r) for r in svc.parent_requests(db, current_user.id, kind=kind, student_id=student_id)]


@router.post("/requests/link-child", response_model=ParentRequestRead, status_code=status.HTTP_201_CREATED,
             summary="Ask the school to link a child to my account")
def request_link_child(payload: LinkChildIn, current_user: ParentUser, db: Db):
    return _req(db, svc.request_link_child(db, current_user, payload))


@router.post("/requests/contact-change", response_model=ParentRequestRead, status_code=status.HTTP_201_CREATED,
             summary="Ask the school to change my mobile number or email")
def request_contact_change(payload: ContactChangeIn, current_user: ParentUser, db: Db):
    return _req(db, svc.request_contact_change(db, current_user, payload))


@router.post("/requests/{request_id}/cancel", response_model=ParentRequestRead)
def cancel_request(request_id: int, current_user: ParentUser, db: Db):
    return _req(db, svc.cancel_request(db, current_user, request_id))


@router.post("/children/{student_id}/transport-requests", response_model=ParentRequestRead,
             status_code=status.HTTP_201_CREATED, summary="Ask for a transport change for a child")
def request_transport(student_id: int, payload: TransportChangeIn, current_user: ParentUser, db: Db):
    return _req(db, svc.request_transport_change(db, current_user, student_id, payload))


@router.post("/children/{student_id}/library/renewal-requests", response_model=ParentRequestRead,
             status_code=status.HTTP_201_CREATED, summary="Ask the library to renew a book")
def request_renewal(student_id: int, payload: LibraryRenewalIn, current_user: ParentUser, db: Db):
    return _req(db, svc.request_library_renewal(db, current_user, student_id, payload))


# ---------- transport ----------


@router.get("/children/{student_id}/transport/stops", response_model=list[RouteStopRead],
            summary="Every stop on the child's route, in order")
def route_stops(student_id: int, current_user: ParentUser, db: Db):
    return [RouteStopRead.model_validate(s) for s in svc.child_route_stops(db, current_user.id, student_id)]


@router.get("/children/{student_id}/transport/stop-options", response_model=list[StopOptionRead],
            summary="Stops the parent can ask for (active routes of the child's school)")
def stop_options(student_id: int, current_user: ParentUser, db: Db):
    return [StopOptionRead.model_validate(s) for s in svc.stop_options(db, current_user.id, student_id)]


# ---------- fees ----------


@router.get("/children/{student_id}/counter-receipts", response_model=list[CounterReceiptRead],
            summary="Receipts for fees paid at the school office")
def counter_receipts(student_id: int, current_user: ParentUser, db: Db, academic_year_id: Optional[int] = None):
    return [
        CounterReceiptRead.model_validate(r)
        for r in svc.counter_receipts(db, current_user.id, student_id, academic_year_id)
    ]


@router.get("/children/{student_id}/counter-receipts/{collection_id}/receipt.pdf")
def counter_receipt_pdf(student_id: int, collection_id: int, current_user: ParentUser, db: Db):
    pdf, filename = svc.counter_receipt_pdf(db, current_user.id, student_id, collection_id)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{filename}"'})


# ---------- progress ----------


@router.get("/children/{student_id}/achievements", response_model=list[AchievementRead])
def achievements(student_id: int, current_user: ParentUser, db: Db):
    return [AchievementRead.model_validate(svc.achievement_read(db, a))
            for a in svc.parent_achievements(db, current_user.id, student_id)]


@router.get("/children/{student_id}/activities", response_model=list[ActivityMembershipRead],
            summary="Clubs, teams and activities the child takes part in")
def activities(student_id: int, current_user: ParentUser, db: Db):
    return [ActivityMembershipRead.model_validate(a) for a in svc.parent_activities(db, current_user.id, student_id)]


@router.get("/children/{student_id}/project-milestones", response_model=list[MilestoneRead],
            summary="Milestones of every project set for the child's class")
def project_milestones(student_id: int, current_user: ParentUser, db: Db):
    return [MilestoneRead.model_validate(svc.milestone_read(m)) for m in svc.parent_milestones(db, current_user.id, student_id)]


@router.get("/children/{student_id}/weekly-reports/{report_id}/subjects", response_model=list[SubjectWeekRead],
            summary="Per-subject topics, homework and tests for a shared weekly report's week")
def weekly_subjects(student_id: int, report_id: int, current_user: ParentUser, db: Db):
    return [SubjectWeekRead.model_validate(s) for s in svc.weekly_subjects(db, current_user.id, student_id, report_id)]


@router.get("/children/{student_id}/meal-menu", response_model=ChildMealMenu,
            summary="The week's menu: the hostel mess for residents, else the school canteen")
def meal_menu(student_id: int, current_user: ParentUser, db: Db):
    return ChildMealMenu.model_validate(svc.child_meal_menu(db, current_user.id, student_id))


# ---------- help desk ----------


@router.get("/help-tickets", response_model=list[TicketRead], summary="My requests to the school office")
def tickets(current_user: ParentUser, db: Db, student_id: Optional[int] = Query(None)):
    return [TicketRead.model_validate(svc.ticket_read(db, t)) for t in svc.parent_tickets(db, current_user.id, student_id)]


@router.post("/help-tickets", response_model=TicketRead, status_code=status.HTTP_201_CREATED)
def create_ticket(payload: TicketIn, current_user: ParentUser, db: Db):
    return TicketRead.model_validate(svc.ticket_read(db, svc.parent_create_ticket(db, current_user, payload), with_replies=True))


@router.get("/help-tickets/{ticket_id}", response_model=TicketRead, summary="One request with its replies (marks them read)")
def ticket(ticket_id: int, current_user: ParentUser, db: Db):
    return TicketRead.model_validate(svc.ticket_read(db, svc.parent_open_ticket(db, current_user.id, ticket_id), with_replies=True))


@router.post("/help-tickets/{ticket_id}/replies", response_model=TicketRead)
def reply(ticket_id: int, payload: TicketReplyIn, current_user: ParentUser, db: Db):
    return TicketRead.model_validate(svc.ticket_read(db, svc.parent_reply(db, current_user, ticket_id, payload.body), with_replies=True))


@router.post("/help-tickets/{ticket_id}/resolve", response_model=TicketRead, summary="Mark my request resolved")
def resolve(ticket_id: int, current_user: ParentUser, db: Db):
    return TicketRead.model_validate(svc.ticket_read(db, svc.parent_resolve(db, current_user, ticket_id), with_replies=True))


# ---------- surveys ----------


@router.get("/surveys", response_model=list[SurveyRead], summary="Open feedback surveys for me, and ones I answered")
def surveys(current_user: ParentUser, db: Db):
    return [SurveyRead.model_validate(s) for s in svc.parent_surveys(db, current_user)]


@router.post("/surveys/{survey_id}/responses", response_model=SurveyRead, summary="Answer (or update my answer to) a survey")
def answer(survey_id: int, payload: SurveyAnswerIn, current_user: ParentUser, db: Db):
    return SurveyRead.model_validate(svc.parent_answer(db, current_user, survey_id, payload.answers))
