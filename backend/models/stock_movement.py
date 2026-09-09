from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base

if TYPE_CHECKING:
    from models.product import Product
    from models.user import User


class StockMovement(Base):
    """
    Append-only audit trail of every stock change (purchase received, sale
    made, manual adjustment, etc.). This is what makes Inventory.current_stock
    changes traceable — every write to Inventory should be paired with a
    row here recording why the number changed.
    """

    __tablename__ = "stock_movements"

    movement_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    movement_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    product: Mapped["Product"] = relationship(back_populates="stock_movements")
    user: Mapped["User"] = relationship(back_populates="stock_movements")
