from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.mixins import TimestampMixin

if TYPE_CHECKING:
    from models.user import User


class Role(Base, TimestampMixin):
    """
    User roles (e.g. Admin, Staff). Used for role-based authorization
    checks on protected routes (see PCD section 11).
    """

    __tablename__ = "roles"

    role_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    role_name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    users: Mapped[list["User"]] = relationship(back_populates="role")
