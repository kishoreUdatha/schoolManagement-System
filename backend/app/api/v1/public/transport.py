"""GPS ingest for bus trackers (or a driver's phone app). Authenticated by the
per-vehicle key generated from the school's Transport > Vehicles screen, sent
in the X-Device-Key header."""
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.transport import GpsPing
from app.services import transport_service


router = APIRouter()


class GpsAck(BaseModel):
    ok: bool = True
    vehicle_id: int


@router.post("/gps", response_model=GpsAck)
def gps_ping(
    payload: GpsPing,
    db: Annotated[Session, Depends(get_db)],
    x_device_key: Annotated[str, Header()],
):
    v = transport_service.record_gps(db, x_device_key, payload)
    return GpsAck(vehicle_id=v.id)
