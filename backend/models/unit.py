from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.mixins import CreatedAtMixin

if TYPE_CHECKING:
    from models.product import Product


class Unit(Base, CreatedAtMixin):
    """Unit of measure for products (e.g. pcs, kg, litre)."""

    __tablename__ = "units"

    unit_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    unit_name: Mapped[str] = mapped_column(String(50), nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    products: Mapped[list["Product"]] = relationship(back_populates="unit")
