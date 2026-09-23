"""My own staff record: what the school holds about me, and the parts I keep up."""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import StaffUser
from app.database import get_db
from app.schemas.self_profile import MyProfileRead, MyProfileUpdate
from app.services import self_profile_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("", response_model=MyProfileRead, summary="My staff record")
def my_profile(current_user: StaffUser, db: Db):
    return MyProfileRead.model_validate(svc.to_read(db, svc.my_staff_row(db, current_user)))


@router.patch("", response_model=MyProfileRead, summary="Change my contact, emergency and bank details")
def update_my_profile(payload: MyProfileUpdate, current_user: StaffUser, db: Db):
    staff = svc.update_mine(db, current_user, payload)
    return MyProfileRead.model_validate(svc.to_read(db, staff))
