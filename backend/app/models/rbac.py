"""Configurable roles and permissions, and branches (campuses).

Every user keeps their base role (it decides which portal they log in to).
A custom role grants extra permissions on top, so a school can delegate work
— for example letting the office approve fee refunds — without new code."""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import UserRole
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class Permission(Base, PrimaryKeyMixin, TimestampMixin):
    """The catalogue of things a role can be allowed to do. Seeded by the
    application, not edited by schools."""

    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("code", name="uq_permission_code"),)

    code: Mapped[str] = mapped_column(String(80), nullable=False)
    module: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)


class Role(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __audited__ = True
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_role_code"),
        Index("ix_roles_school", "school_id", "is_active"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    # which portal someone with this role signs in to
    base_role: Mapped[UserRole] = mapped_column(SAEnum(UserRole, name="user_role"), nullable=False)
    # built-in roles mirror the fixed ones and can't be deleted
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    permissions: Mapped[list["RolePermission"]] = relationship(
        back_populates="role", cascade="all, delete-orphan"
    )


class RolePermission(Base, PrimaryKeyMixin, _School):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),)

    role_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False
    )
    permission_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False
    )

    role: Mapped[Role] = relationship(back_populates="permissions")


class UserRoleAssignment(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Gives one user a custom role, optionally only at one branch."""

    __audited__ = True
    __tablename__ = "user_role_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_role"),
        Index("ix_user_role_assignments_user", "user_id"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False
    )
    branch_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("branches.id", ondelete="SET NULL")
    )
    assigned_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Branch(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A campus or wing of the school. Sections and staff can belong to one."""

    __audited__ = True
    __tablename__ = "branches"
    __table_args__ = (UniqueConstraint("school_id", "code", name="uq_branch_code"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    head_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    is_main: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    capacity: Mapped[Optional[int]] = mapped_column(Integer)  # students the campus can take
