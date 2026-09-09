from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.mixins import TimestampMixin

if TYPE_CHECKING:
    from models.ai_recommendation import AIRecommendation  # noqa: F401
    from models.purchase import Purchase
    from models.role import Role
    from models.sale import Sale
    from models.stock_movement import StockMovement


class User(Base, TimestampMixin):
    """System users (staff/admins) who log in and perform actions such as
    recording purchases, sales, and stock movements."""

    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.role_id"), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    role: Mapped["Role"] = relationship(back_populates="users")
    purchases: Mapped[list["Purchase"]] = relationship(back_populates="user")
    sales: Mapped[list["Sale"]] = relationship(back_populates="user")
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="user")
