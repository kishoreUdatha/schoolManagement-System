"""Parent side of events (consent), parent-teacher meetings, gallery and calendar."""
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core import storage
from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.events import (
    AlbumDetail,
    AlbumRead,
    BookIn,
    CalendarItem,
    ConsentIn,
    ParentEvent,
    ParentPtm,
)
from app.services import attachment_service
from app.services import events_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/calendar", response_model=list[CalendarItem])
def calendar(current_user: ParentUser, db: Db, start: Optional[date] = None, end: Optional[date] = None):
    start = start or date.today().replace(day=1)
    end = end or start + timedelta(days=41)
    if (end - start).days > 400:
        end = start + timedelta(days=400)
    return svc.parent_calendar(db, current_user.id, start, end)


@router.get("/events", response_model=list[ParentEvent])
def events(current_user: ParentUser, db: Db, start: Optional[date] = None, end: Optional[date] = None):
    return svc.parent_events(db, current_user.id, start, end)


@router.post("/events/{event_id}/consent", response_model=list[ParentEvent], summary="Give or decline consent")
def consent(event_id: int, payload: ConsentIn, current_user: ParentUser, db: Db):
    e = svc.give_consent(db, current_user.id, event_id, payload.student_id, payload.response, payload.note)
    ev = svc.get_event(db, e.event_id, e.school_id)
    return [x for x in svc.parent_events(db, current_user.id, ev.start_date, ev.end_date) if x["id"] == event_id]


@router.get("/events/{event_id}/files/{attachment_id}", summary="Open a circular or permission slip on an event")
def event_file(event_id: int, attachment_id: int, current_user: ParentUser, db: Db):
    return attachment_service.file_response(svc.parent_event_file(db, current_user.id, event_id, attachment_id))


@router.get("/ptm", response_model=list[ParentPtm])
def meetings(current_user: ParentUser, db: Db):
    return svc.parent_sessions(db, current_user.id)


@router.post("/ptm/book", response_model=list[ParentPtm])
def book(payload: BookIn, current_user: ParentUser, db: Db):
    svc.book_slot(db, current_user.id, payload.slot_id, payload.student_id, payload.note, payload.meeting_mode)
    return svc.parent_sessions(db, current_user.id)


@router.delete("/ptm/slots/{slot_id}", response_model=list[ParentPtm])
def cancel(slot_id: int, current_user: ParentUser, db: Db):
    svc.parent_cancel(db, current_user.id, slot_id)
    return svc.parent_sessions(db, current_user.id)


@router.get("/gallery", response_model=list[AlbumRead])
def albums(current_user: ParentUser, db: Db):
    return svc.parent_albums(db, current_user.id)


@router.get("/gallery/{album_id}", response_model=AlbumDetail)
def album(album_id: int, current_user: ParentUser, db: Db):
    return svc.album_detail(db, svc.parent_album(db, current_user.id, album_id))


@router.get("/gallery/photos/{photo_id}/file")
def photo_file(photo_id: int, current_user: ParentUser, db: Db):
    from app.models.events import GalleryPhoto

    p = db.get(GalleryPhoto, photo_id)
    if not p:
        raise svc._404("Photo")
    svc.parent_album(db, current_user.id, p.album_id)
    return Response(
        content=storage.read(p.file_key), media_type=p.content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )
