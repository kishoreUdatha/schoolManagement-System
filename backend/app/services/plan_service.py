from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.plan import Plan, PlanModule
from app.schemas.plan import PlanCreate, PlanModuleItem, PlanUpdate


def create_plan(db: Session, data: PlanCreate) -> Plan:
    if db.execute(select(Plan).where(Plan.name == data.name)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Plan name '{data.name}' already exists",
        )

    plan = Plan(
        name=data.name,
        tier=data.tier,
        description=data.description,
        price_monthly=data.price_monthly,
        price_yearly=data.price_yearly,
        student_limit=data.student_limit,
        staff_limit=data.staff_limit,
        storage_mb_limit=data.storage_mb_limit,
        sms_quota=data.sms_quota,
        whatsapp_quota=data.whatsapp_quota,
        email_quota=data.email_quota,
        is_active=True,
    )
    db.add(plan)
    db.flush()

    for m in data.modules:
        db.add(PlanModule(plan_id=plan.id, module_key=m.module_key, enabled=m.enabled))

    db.commit()
    db.refresh(plan)
    return plan


def list_plans(
    db: Session, *, page: int = 1, page_size: int = 50, active_only: bool = True
) -> tuple[list[Plan], int]:
    base = select(Plan).options(selectinload(Plan.modules))
    count_base = select(func.count(Plan.id))

    if active_only:
        base = base.where(Plan.is_active.is_(True))
        count_base = count_base.where(Plan.is_active.is_(True))

    total = db.execute(count_base).scalar_one()
    items = (
        db.execute(
            base.order_by(Plan.tier, Plan.price_monthly).offset((page - 1) * page_size).limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(items), total


def get_plan(db: Session, plan_id: int) -> Plan:
    plan = db.execute(
        select(Plan).where(Plan.id == plan_id).options(selectinload(Plan.modules))
    ).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return plan


def update_plan(db: Session, plan_id: int, data: PlanUpdate) -> Plan:
    plan = get_plan(db, plan_id)
    update_fields = data.model_dump(exclude_unset=True, exclude={"modules"})
    for field, value in update_fields.items():
        setattr(plan, field, value)

    if data.modules is not None:
        # Replace module set entirely
        for existing in list(plan.modules):
            db.delete(existing)
        db.flush()
        for m in data.modules:
            db.add(PlanModule(plan_id=plan.id, module_key=m.module_key, enabled=m.enabled))

    db.commit()
    db.refresh(plan)
    return plan


def deactivate_plan(db: Session, plan_id: int) -> Plan:
    plan = get_plan(db, plan_id)
    plan.is_active = False
    db.commit()
    db.refresh(plan)
    return plan
