from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base

if TYPE_CHECKING:
    from models.product import Product
    from models.sale import Sale


class SaleItem(Base):
    """Line items belonging to a Sale — one row per product sold."""

    __tablename__ = "sale_items"

    sale_item_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.sale_id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    sale: Mapped["Sale"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship(back_populates="sale_items")
