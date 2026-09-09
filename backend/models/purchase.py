from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.mixins import CreatedAtMixin

if TYPE_CHECKING:
    from models.purchase_item import PurchaseItem
    from models.supplier import Supplier
    from models.user import User


class Purchase(Base, CreatedAtMixin):
    """A purchase order recorded against a supplier. Line items live in
    PurchaseItems; completing a purchase increases Inventory.current_stock
    and logs a StockMovement (implemented in the services layer, Phase 5)."""

    __tablename__ = "purchases"

    purchase_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.supplier_id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    supplier: Mapped["Supplier"] = relationship(back_populates="purchases")
    user: Mapped["User"] = relationship(back_populates="purchases")
    items: Mapped[list["PurchaseItem"]] = relationship(
        back_populates="purchase", cascade="all, delete-orphan"
    )
