from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.mixins import TimestampMixin

if TYPE_CHECKING:
    from models.product import Product


class Category(Base, TimestampMixin):
    """Product categories (e.g. Beverages, Electronics)."""

    __tablename__ = "categories"

    category_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    category_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    products: Mapped[list["Product"]] = relationship(back_populates="category")
