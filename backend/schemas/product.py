from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# --- Lightweight nested schemas (used inside ProductRead so the frontend
# gets readable names, not just raw foreign key IDs, without a second
# request) ---
class CategoryBrief(BaseModel):
    category_id: int
    category_name: str

    model_config = ConfigDict(from_attributes=True)


class SupplierBrief(BaseModel):
    supplier_id: int
    company_name: str

    model_config = ConfigDict(from_attributes=True)


class UnitBrief(BaseModel):
    unit_id: int
    unit_name: str
    symbol: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ProductBrief(BaseModel):
    product_id: int
    product_name: str
    sku: str

    model_config = ConfigDict(from_attributes=True)


class ProductBase(BaseModel):
    product_name: str = Field(min_length=1, max_length=150)
    sku: str = Field(min_length=1, max_length=50)
    barcode: str | None = Field(default=None, max_length=50)
    description: str | None = None
    cost_price: Decimal = Field(ge=0)
    selling_price: Decimal = Field(ge=0)
    image_url: str | None = Field(default=None, max_length=255)
    category_id: int
    supplier_id: int
    unit_id: int


class ProductCreate(ProductBase):
    """Creating a product also creates its paired Inventory row (starting
    at 0 stock) — see services/product_service.py."""

    pass


class ProductUpdate(BaseModel):
    product_name: str | None = Field(default=None, min_length=1, max_length=150)
    sku: str | None = Field(default=None, min_length=1, max_length=50)
    barcode: str | None = Field(default=None, max_length=50)
    description: str | None = None
    cost_price: Decimal | None = Field(default=None, ge=0)
    selling_price: Decimal | None = Field(default=None, ge=0)
    image_url: str | None = Field(default=None, max_length=255)
    category_id: int | None = None
    supplier_id: int | None = None
    unit_id: int | None = None


class ProductRead(BaseModel):
    product_id: int
    product_name: str
    sku: str
    barcode: str | None
    description: str | None
    cost_price: Decimal
    selling_price: Decimal
    image_url: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    category: CategoryBrief
    supplier: SupplierBrief
    unit: UnitBrief

    model_config = ConfigDict(from_attributes=True)


class ProductListResponse(BaseModel):
    """Paginated product list response (PCD scope: Search, Pagination)."""

    items: list[ProductRead]
    total: int
    skip: int
    limit: int
