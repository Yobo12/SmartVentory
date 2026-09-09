from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.mixins import TimestampMixin

if TYPE_CHECKING:
    from models.product import Product
    from models.purchase import Purchase


class Supplier(Base, TimestampMixin):
    """Companies that supply products, referenced by Products and Purchases."""

    __tablename__ = "suppliers"

    supplier_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    products: Mapped[list["Product"]] = relationship(back_populates="supplier")
    purchases: Mapped[list["Purchase"]] = relationship(back_populates="supplier")
