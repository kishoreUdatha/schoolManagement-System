from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import PayrollManager
from app.database import get_db
from app.schemas.payroll import (
    PayslipAdjust,
    PayslipRead,
    RunCreate,
    RunDetail,
    RunPaid,
    RunRead,
    SalaryIn,
    SalaryRead,
    SettingsRead,
    SettingsUpdate,
    StaffPayRow,
)
from app.services import payroll_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
# payroll is a job of its own: the office, the accountant, or whoever holds payroll.manage
Actor = PayrollManager


@router.get("/settings", response_model=SettingsRead)
def get_settings(current_user: Actor, db: Db):
    return SettingsRead.model_validate(svc.get_settings(db, current_user.tenant_id, current_user.school_id))


@router.patch("/settings", response_model=SettingsRead)
def update_settings(payload: SettingsUpdate, current_user: Actor, db: Db):
    return SettingsRead.model_validate(
        svc.update_settings(db, current_user.tenant_id, current_user.school_id, payload)
    )


@router.get("/staff", response_model=list[StaffPayRow], summary="Staff with their current salary structure")
def staff(current_user: Actor, db: Db):
    return [StaffPayRow.model_validate(r) for r in svc.staff_pay_rows(db, current_user.school_id)]


@router.get("/staff/{staff_id}/salaries", response_model=list[SalaryRead])
def salary_history(staff_id: int, current_user: Actor, db: Db):
    return [SalaryRead.model_validate(svc.salary_to_read(s)) for s in svc.salary_history(db, staff_id, current_user.school_id)]


@router.put(
    "/staff/{staff_id}/salary",
    response_model=SalaryRead,
    summary="Set the salary from a date (same date = correct it; later date = revision)",
)
def set_salary(staff_id: int, payload: SalaryIn, current_user: Actor, db: Db):
    s = svc.set_salary(db, current_user.tenant_id, current_user.school_id, staff_id, payload)
    return SalaryRead.model_validate(svc.salary_to_read(s))


@router.get("/runs", response_model=list[RunRead])
def list_runs(current_user: Actor, db: Db):
    return [RunRead.model_validate(svc.run_to_read(db, r)) for r in svc.list_runs(db, current_user.school_id)]


@router.post("/runs", response_model=RunDetail, status_code=status.HTTP_201_CREATED)
def create_run(payload: RunCreate, current_user: Actor, db: Db):
    run, skipped = svc.create_run(db, current_user.tenant_id, current_user.school_id, current_user.id, payload.period)
    return RunDetail.model_validate(svc.run_to_read(db, run, with_slips=True, skipped=skipped))


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run(run_id: int, current_user: Actor, db: Db):
    run = svc.get_run(db, run_id, current_user.school_id)
    return RunDetail.model_validate(svc.run_to_read(db, run, with_slips=True))


@router.post("/runs/{run_id}/recalculate", response_model=RunDetail)
def recalculate(run_id: int, current_user: Actor, db: Db):
    run, skipped = svc.recalculate(db, run_id, current_user.school_id)
    return RunDetail.model_validate(svc.run_to_read(db, run, with_slips=True, skipped=skipped))


@router.patch("/runs/{run_id}/payslips/{slip_id}", response_model=PayslipRead)
def adjust(run_id: int, slip_id: int, payload: PayslipAdjust, current_user: Actor, db: Db):
    slip = svc.adjust_slip(db, run_id, slip_id, current_user.school_id, payload)
    return PayslipRead.model_validate(svc.slip_to_read(db, slip, svc.get_run(db, run_id, current_user.school_id)))


@router.post("/runs/{run_id}/finalize", response_model=RunRead)
def finalize(run_id: int, current_user: Actor, db: Db):
    return RunRead.model_validate(svc.run_to_read(db, svc.finalize(db, run_id, current_user.school_id, current_user.id)))


@router.post("/runs/{run_id}/reopen", response_model=RunRead)
def reopen(run_id: int, current_user: Actor, db: Db):
    return RunRead.model_validate(svc.run_to_read(db, svc.reopen(db, run_id, current_user.school_id)))


@router.post("/runs/{run_id}/paid", response_model=RunRead)
def mark_paid(run_id: int, payload: RunPaid, current_user: Actor, db: Db):
    return RunRead.model_validate(svc.run_to_read(db, svc.mark_paid(db, run_id, current_user.school_id, payload)))


@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(run_id: int, current_user: Actor, db: Db):
    svc.delete_run(db, run_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/runs/{run_id}/bank-file.csv")
def bank_file(run_id: int, current_user: Actor, db: Db):
    content, filename = svc.bank_file(db, run_id, current_user.school_id)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/payslips/{slip_id}/pdf")
def payslip_pdf(slip_id: int, current_user: Actor, db: Db):
    slip, run = svc.get_slip(db, slip_id, school_id=current_user.school_id)
    content, filename = svc.payslip_pdf(db, slip, run)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
