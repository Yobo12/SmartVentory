from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base

if TYPE_CHECKING:
    from models.product import Product


class Inventory(Base):
    """
    The single source of truth for stock quantity (see decision recorded
    in Phase 2 planning: Inventory.current_stock is authoritative;
    application code must always update this table — via services, never
    directly — whenever stock changes, alongside a StockMovements entry
    as the audit trail).

    One-to-one with Products via the unique product_id foreign key.
    """

    __tablename__ = "inventory"

    inventory_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.product_id"), unique=True, nullable=False
    )
    current_stock: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    maximum_stock: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    reorder_level: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    product: Mapped["Product"] = relationship(back_populates="inventory")
