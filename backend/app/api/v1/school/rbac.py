"""Roles, permissions, who has them, and branches."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, allow
from app.core.enums import UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.rbac import (
    AssignIn,
    BulkAssignIn,
    AssignmentRead,
    BranchIn,
    BranchRead,
    IdsIn,
    MyAccess,
    PermissionRead,
    RoleIn,
    RoleRead,
)
from app.services import rbac_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
# the school admin always can; a principal (or anyone) can be given the permission
RoleManager = Annotated[User, Depends(allow(UserRole.school_admin, permission="roles.manage"))]
BranchManager = Annotated[User, Depends(allow(UserRole.school_admin, permission="branches.manage"))]
# the list is also read by staff records (departments sit in branches)
BranchReader = Annotated[User, Depends(allow(UserRole.school_admin, permission="branches.manage", any_of=("staff.manage",)))]


@router.get("/permissions", response_model=list[PermissionRead], summary="Everything a role can be allowed to do")
def permissions(current_user: RoleManager, db: Db):
    return svc.list_permissions(db)


@router.get("/me/access", response_model=MyAccess, summary="My roles and what they let me do")
def my_access(current_user: CurrentUser, db: Db):
    return svc.my_access(db, current_user)


# ---------- roles ----------


@router.get("/roles", response_model=list[RoleRead])
def list_roles(current_user: RoleManager, db: Db):
    return [svc.role_to_read(db, r) for r in svc.list_roles(db, current_user.tenant_id, current_user.school_id)]


@router.post("/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
def create_role(payload: RoleIn, current_user: RoleManager, db: Db):
    return svc.role_to_read(db, svc.create_role(db, current_user, payload))


@router.put("/roles/{role_id}", response_model=RoleRead)
def update_role(role_id: int, payload: RoleIn, current_user: RoleManager, db: Db):
    return svc.role_to_read(db, svc.update_role(db, current_user, role_id, payload))


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: int, current_user: RoleManager, db: Db):
    svc.delete_role(db, current_user, role_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- who has which role ----------


@router.get("/role-assignments", response_model=list[AssignmentRead])
def assignments(current_user: RoleManager, db: Db, user_id: Optional[int] = None, role_id: Optional[int] = None):
    return svc.assignments(db, current_user.school_id, user_id, role_id)


@router.post("/role-assignments", response_model=list[AssignmentRead], status_code=status.HTTP_201_CREATED)
def assign(payload: AssignIn, current_user: RoleManager, db: Db):
    svc.assign(db, current_user, payload.user_id, payload.role_id, payload.branch_id)
    return svc.assignments(db, current_user.school_id, payload.user_id, None)


@router.post("/role-assignments/bulk", summary="Give one role to several people at once")
def bulk_assign(payload: BulkAssignIn, current_user: RoleManager, db: Db):
    return svc.bulk_assign(db, current_user, payload.user_ids, payload.role_id, payload.branch_id)


@router.delete("/role-assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def unassign(assignment_id: int, current_user: RoleManager, db: Db):
    svc.unassign(db, current_user, assignment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- branches ----------


@router.get("/branches", response_model=list[BranchRead])
def list_branches(current_user: BranchReader, db: Db):
    return [svc.branch_to_read(db, b) for b in svc.list_branches(db, current_user.school_id)]


@router.post("/branches", response_model=BranchRead, status_code=status.HTTP_201_CREATED)
def create_branch(payload: BranchIn, current_user: BranchManager, db: Db):
    return svc.branch_to_read(db, svc.create_branch(db, current_user, payload))


@router.put("/branches/{branch_id}", response_model=BranchRead)
def update_branch(branch_id: int, payload: BranchIn, current_user: BranchManager, db: Db):
    return svc.branch_to_read(db, svc.update_branch(db, current_user, branch_id, payload))


@router.delete("/branches/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_branch(branch_id: int, current_user: BranchManager, db: Db):
    svc.delete_branch(db, current_user, branch_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/branches/{branch_id}/sections", response_model=BranchRead, summary="Set which sections are at this branch")
def set_sections(branch_id: int, payload: IdsIn, current_user: BranchManager, db: Db):
    svc.set_sections(db, current_user, branch_id, payload.ids)
    return svc.branch_to_read(db, svc.get_branch(db, branch_id, current_user.school_id))


@router.put("/branches/{branch_id}/staff", response_model=BranchRead, summary="Set which staff work at this branch")
def set_staff(branch_id: int, payload: IdsIn, current_user: BranchManager, db: Db):
    svc.set_staff(db, current_user, branch_id, payload.ids)
    return svc.branch_to_read(db, svc.get_branch(db, branch_id, current_user.school_id))
