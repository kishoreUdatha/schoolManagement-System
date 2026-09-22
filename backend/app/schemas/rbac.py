from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.enums import UserRole


class PermissionRead(BaseModel):
    code: str
    module: str
    name: str
    description: Optional[str]


class RoleIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    code: str = Field(..., min_length=2, max_length=40)
    description: Optional[str] = Field(None, max_length=1000)
    base_role: UserRole = UserRole.staff
    is_active: bool = True
    permissions: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        v = v.strip().lower().replace(" ", "_")
        if not v.replace("_", "").isalnum():
            raise ValueError("Use letters, numbers and underscores in the code")
        return v


class RoleRead(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    base_role: UserRole
    is_system: bool
    is_active: bool
    permissions: list[str]
    users: int


class AssignIn(BaseModel):
    user_id: int
    role_id: int
    branch_id: Optional[int] = None


class AssignmentRead(BaseModel):
    id: int
    user_id: int
    user_name: str
    role_id: int
    role_name: str
    branch_id: Optional[int]
    branch_name: Optional[str]
    assigned_at: datetime


class MyAccess(BaseModel):
    base_role: UserRole
    roles: list[str]
    permissions: list[str]


class BranchIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    code: str = Field(..., min_length=1, max_length=20)
    address: Optional[str] = Field(None, max_length=2000)
    phone: Optional[str] = Field(None, max_length=20)
    head_user_id: Optional[int] = None
    is_main: bool = False
    is_active: bool = True
    # Leave out to keep what is saved; null clears.
    email: Optional[str] = Field(None, max_length=255)
    capacity: Optional[int] = Field(None, ge=0, le=100000)


class BranchRead(BaseModel):
    id: int
    name: str
    code: str
    address: Optional[str]
    phone: Optional[str]
    head_user_id: Optional[int]
    head_name: Optional[str]
    is_main: bool
    is_active: bool
    email: Optional[str] = None
    capacity: Optional[int] = None
    sections: int
    staff: int
    students: int
    section_ids: list[int] = []


class IdsIn(BaseModel):
    ids: list[int] = Field(default_factory=list, max_length=500)
