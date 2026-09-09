from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base
from models.mixins import TimestampMixin

if TYPE_CHECKING:
    from models.ai_recommendation import AIRecommendation
    from models.category import Category
    from models.inventory import Inventory
    from models.purchase_item import PurchaseItem
    from models.sale_item import SaleItem
    from models.stock_movement import StockMovement
    from models.supplier import Supplier
    from models.unit import Unit


class Product(Base, TimestampMixin):
    """
    The product catalog. Stock quantity itself is NOT stored here — see
    Inventory (one-to-one via product_id), which is the single source of
    truth for CurrentStock. Keeping catalog data (name, price, SKU) and
    stock data (quantity, reorder level) in separate tables per PCD
    section 7 ("Inventory stored separately from Products").
    """

    __tablename__ = "products"

    product_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.category_id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.supplier_id"), nullable=False)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.unit_id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String(150), nullable=False)
    sku: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    barcode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    selling_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    category: Mapped["Category"] = relationship(back_populates="products")
    supplier: Mapped["Supplier"] = relationship(back_populates="products")
    unit: Mapped["Unit"] = relationship(back_populates="products")
    inventory: Mapped["Inventory"] = relationship(
        back_populates="product", uselist=False, cascade="all, delete-orphan"
    )
    purchase_items: Mapped[list["PurchaseItem"]] = relationship(back_populates="product")
    sale_items: Mapped[list["SaleItem"]] = relationship(back_populates="product")
    stock_movements: Mapped[list["StockMovement"]] = relationship(back_populates="product")
    ai_recommendations: Mapped[list["AIRecommendation"]] = relationship(back_populates="product")
