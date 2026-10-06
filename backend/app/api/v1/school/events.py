"""Events, parent-teacher meetings and the photo gallery (school side).

Managing needs the school admin; the calendar, published albums and photos
are readable by every staff role."""
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.v1.school.directory import _school_staff
from app.core import storage
from app.core.deps import EventsManager, SchoolAdminUser
from app.core.enums import UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.events import (
    AlbumDetail,
    AlbumIn,
    AlbumRead,
    CalendarItem,
    CaptionIn,
    ConsentReport,
    EventIn,
    EventRead,
    PhotoRead,
    PtmSessionDetail,
    PtmSessionIn,
    PtmSessionRead,
    TeachersIn,
)
from app.services import attachment_service
from app.services import events_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(_school_staff)]


def _window(start: Optional[date], end: Optional[date]) -> tuple[date, date]:
    start = start or date.today().replace(day=1)
    end = end or start + timedelta(days=41)
    if (end - start).days > 400:
        end = start + timedelta(days=400)
    return start, end


# ---------- calendar ----------


@router.get("/calendar", response_model=list[CalendarItem], summary="Events, holidays, exams and meetings")
def calendar(current_user: Staff, db: Db, start: Optional[date] = None, end: Optional[date] = None):
    return svc.staff_calendar(db, current_user, *_window(start, end))


# ---------- events ----------


@router.get("/events", response_model=list[EventRead])
def list_events(current_user: Staff, db: Db, start: Optional[date] = None, end: Optional[date] = None):
    admin = current_user.role == UserRole.school_admin
    rows = svc.list_events(db, current_user.school_id, start, end, published_only=not admin)
    return svc.events_to_read(db, rows)


@router.post("/events", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventIn, current_user: EventsManager, db: Db):
    e = svc.create_event(db, current_user.tenant_id, current_user.school_id, current_user.id, payload)
    return svc.events_to_read(db, [e])[0]


@router.put("/events/{event_id}", response_model=EventRead)
def update_event(event_id: int, payload: EventIn, current_user: EventsManager, db: Db):
    e = svc.update_event(db, svc.get_event(db, event_id, current_user.school_id), payload)
    return svc.events_to_read(db, [e])[0]


@router.post("/events/{event_id}/publish", response_model=EventRead, summary="Publish and notify the audience")
def publish_event(event_id: int, current_user: EventsManager, db: Db):
    e = svc.publish_event(db, svc.get_event(db, event_id, current_user.school_id))
    return svc.events_to_read(db, [e])[0]


@router.post("/events/{event_id}/cancel", response_model=EventRead)
def cancel_event(event_id: int, current_user: EventsManager, db: Db):
    e = svc.cancel_event(db, svc.get_event(db, event_id, current_user.school_id))
    return svc.events_to_read(db, [e])[0]


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: int, current_user: EventsManager, db: Db):
    svc.delete_event(db, svc.get_event(db, event_id, current_user.school_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/events/{event_id}/files", response_model=EventRead, status_code=status.HTTP_201_CREATED,
             summary="Attach a circular or permission slip (PDF, image or Word; up to 5)")
def add_event_files(event_id: int, current_user: EventsManager, db: Db, files: list[UploadFile] = File(...)):
    e = svc.get_event(db, event_id, current_user.school_id)
    attachment_service.add(db, kind="event", owner_id=e.id, tenant_id=e.tenant_id, school_id=e.school_id,
                           user_id=current_user.id, files=files)
    return svc.events_to_read(db, [e])[0]


@router.delete("/events/{event_id}/files/{attachment_id}", response_model=EventRead)
def remove_event_file(event_id: int, attachment_id: int, current_user: EventsManager, db: Db):
    e = svc.get_event(db, event_id, current_user.school_id)
    attachment_service.remove(db, attachment_service.get(db, "event", e.id, attachment_id))
    return svc.events_to_read(db, [e])[0]


@router.get("/events/{event_id}/files/{attachment_id}", summary="Open a file on an event")
def event_file(event_id: int, attachment_id: int, current_user: Staff, db: Db):
    e = svc.get_event(db, event_id, current_user.school_id)
    # staff other than the admin see published events only, as in the list
    if not e.is_published and current_user.role != UserRole.school_admin:
        raise svc._404("Event")
    return attachment_service.file_response(attachment_service.get(db, "event", e.id, attachment_id))


@router.get("/events/{event_id}/consents", response_model=ConsentReport)
def consents(event_id: int, current_user: EventsManager, db: Db):
    return svc.consent_report(db, svc.get_event(db, event_id, current_user.school_id))


# ---------- parent-teacher meetings ----------


@router.get("/ptm", response_model=list[PtmSessionRead])
def list_ptm(current_user: SchoolAdminUser, db: Db, upcoming: bool = False):
    return svc.list_sessions(db, current_user.school_id, upcoming)


@router.post("/ptm", response_model=PtmSessionRead, status_code=status.HTTP_201_CREATED)
def create_ptm(payload: PtmSessionIn, current_user: SchoolAdminUser, db: Db):
    s = svc.create_session(db, current_user.tenant_id, current_user.school_id, current_user.id, payload)
    return svc.session_to_read(db, s)


@router.get("/ptm/{session_id}", response_model=PtmSessionDetail)
def get_ptm(session_id: int, current_user: SchoolAdminUser, db: Db):
    return svc.session_detail(db, svc.get_session(db, session_id, current_user.school_id))


@router.put("/ptm/{session_id}", response_model=PtmSessionRead)
def update_ptm(session_id: int, payload: PtmSessionIn, current_user: SchoolAdminUser, db: Db):
    s = svc.update_session(db, svc.get_session(db, session_id, current_user.school_id), payload)
    return svc.session_to_read(db, s)


@router.delete("/ptm/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ptm(session_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete_session(db, svc.get_session(db, session_id, current_user.school_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/ptm/{session_id}/teachers", response_model=PtmSessionDetail, summary="Add teachers (creates their slots)")
def add_teachers(session_id: int, payload: TeachersIn, current_user: SchoolAdminUser, db: Db):
    s = svc.get_session(db, session_id, current_user.school_id)
    svc.add_teachers(db, s, payload.user_ids)
    return svc.session_detail(db, s)


@router.delete("/ptm/{session_id}/teachers/{teacher_user_id}", response_model=PtmSessionDetail)
def remove_teacher(session_id: int, teacher_user_id: int, current_user: SchoolAdminUser, db: Db):
    s = svc.get_session(db, session_id, current_user.school_id)
    svc.remove_teacher(db, s, teacher_user_id)
    return svc.session_detail(db, s)


@router.post("/ptm/{session_id}/publish", response_model=PtmSessionDetail)
def publish_ptm(session_id: int, current_user: SchoolAdminUser, db: Db):
    s = svc.publish_session(db, svc.get_session(db, session_id, current_user.school_id))
    return svc.session_detail(db, s)


@router.delete("/ptm/{session_id}/slots/{slot_id}/booking", response_model=PtmSessionDetail)
def cancel_booking(session_id: int, slot_id: int, current_user: SchoolAdminUser, db: Db):
    s = svc.get_session(db, session_id, current_user.school_id)
    svc.admin_cancel_booking(db, s, slot_id)
    return svc.session_detail(db, s)


# ---------- gallery ----------


@router.get("/gallery", response_model=list[AlbumRead])
def list_albums(current_user: Staff, db: Db):
    admin = current_user.role == UserRole.school_admin
    return svc.list_albums(db, current_user.school_id, published_only=not admin)


@router.post("/gallery", response_model=AlbumRead, status_code=status.HTTP_201_CREATED)
def create_album(payload: AlbumIn, current_user: EventsManager, db: Db):
    a = svc.create_album(db, current_user.tenant_id, current_user.school_id, current_user.id, payload)
    return svc.albums_to_read(db, [a])[0]


def _album_for(db: Session, user: User, album_id: int):
    a = svc.get_album(db, album_id, user.school_id)
    if not a.is_published and user.role != UserRole.school_admin:
        raise svc._404("Album")
    return a


@router.get("/gallery/{album_id}", response_model=AlbumDetail)
def get_album(album_id: int, current_user: Staff, db: Db):
    return svc.album_detail(db, _album_for(db, current_user, album_id))


@router.put("/gallery/{album_id}", response_model=AlbumRead)
def update_album(album_id: int, payload: AlbumIn, current_user: EventsManager, db: Db):
    a = svc.update_album(db, svc.get_album(db, album_id, current_user.school_id), payload)
    return svc.albums_to_read(db, [a])[0]


@router.post("/gallery/{album_id}/publish", response_model=AlbumRead)
def publish_album(album_id: int, current_user: EventsManager, db: Db, published: bool = True):
    a = svc.set_album_published(db, svc.get_album(db, album_id, current_user.school_id), published)
    return svc.albums_to_read(db, [a])[0]


@router.delete("/gallery/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_album(album_id: int, current_user: EventsManager, db: Db):
    svc.delete_album(db, svc.get_album(db, album_id, current_user.school_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/gallery/{album_id}/photos", response_model=list[PhotoRead], status_code=status.HTTP_201_CREATED)
def upload_photos(
    album_id: int, current_user: EventsManager, db: Db, files: list[UploadFile] = File(...)
):
    a = svc.get_album(db, album_id, current_user.school_id)
    return svc.upload_photos(db, a, current_user.id, files)


@router.patch("/gallery/photos/{photo_id}", response_model=PhotoRead)
def caption_photo(photo_id: int, payload: CaptionIn, current_user: EventsManager, db: Db):
    p = svc.get_photo(db, photo_id, current_user.school_id)
    p.caption = payload.caption
    db.commit()
    db.refresh(p)
    return p


@router.delete("/gallery/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(photo_id: int, current_user: EventsManager, db: Db):
    svc.delete_photo(db, svc.get_photo(db, photo_id, current_user.school_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/gallery/photos/{photo_id}/file")
def photo_file(photo_id: int, current_user: Staff, db: Db):
    p = svc.get_photo(db, photo_id, current_user.school_id)
    _album_for(db, current_user, p.album_id)
    return Response(
        content=storage.read(p.file_key), media_type=p.content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )
