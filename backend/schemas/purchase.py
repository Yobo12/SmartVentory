from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from schemas.product import ProductBrief


class SupplierBrief(BaseModel):
    supplier_id: int
    company_name: str

    model_config = ConfigDict(from_attributes=True)


class PurchaseItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0, description="Quantity received")
    unit_cost: Decimal = Field(ge=0)


class PurchaseItemRead(BaseModel):
    purchase_item_id: int
    product_id: int
    quantity: Decimal
    unit_cost: Decimal
    subtotal: Decimal
    product: ProductBrief

    model_config = ConfigDict(from_attributes=True)


class PurchaseCreate(BaseModel):
    supplier_id: int
    purchase_date: date
    items: list[PurchaseItemCreate] = Field(min_length=1)


class PurchaseRead(BaseModel):
    purchase_id: int
    supplier_id: int
    user_id: int
    purchase_date: date
    total_cost: Decimal
    status: str
    created_at: datetime
    supplier: SupplierBrief
    items: list[PurchaseItemRead]

    model_config = ConfigDict(from_attributes=True)


class PurchaseListResponse(BaseModel):
    items: list[PurchaseRead]
    total: int
    skip: int
    limit: int
