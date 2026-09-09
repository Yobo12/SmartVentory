from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.mixins import CreatedAtMixin

if TYPE_CHECKING:
    from models.sale_item import SaleItem
    from models.user import User


class Sale(Base, CreatedAtMixin):
    """A sales transaction. Line items live in SaleItems; completing a sale
    decreases Inventory.current_stock and logs a StockMovement (services
    layer, Phase 5)."""

    __tablename__ = "sales"

    sale_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")

    user: Mapped["User"] = relationship(back_populates="sales")
    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan"
    )
