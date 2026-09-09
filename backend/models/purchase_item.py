from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base

if TYPE_CHECKING:
    from models.product import Product
    from models.purchase import Purchase


class PurchaseItem(Base):
    """Line items belonging to a Purchase — one row per product purchased."""

    __tablename__ = "purchase_items"

    purchase_item_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.purchase_id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    purchase: Mapped["Purchase"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship(back_populates="purchase_items")
