from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from schemas.product import ProductBrief


class SaleItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal | None = Field(
        default=None, ge=0, description="Defaults to the product's current selling_price if omitted."
    )


class SaleItemRead(BaseModel):
    sale_item_id: int
    product_id: int
    quantity: Decimal
    unit_price: Decimal
    subtotal: Decimal
    product: ProductBrief

    model_config = ConfigDict(from_attributes=True)


class SaleCreate(BaseModel):
    sale_date: date
    payment_method: str = Field(min_length=1, max_length=50)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    tax: Decimal = Field(default=Decimal("0"), ge=0)
    items: list[SaleItemCreate] = Field(min_length=1)


class SaleRead(BaseModel):
    sale_id: int
    user_id: int
    sale_date: date
    subtotal: Decimal
    discount: Decimal
    tax: Decimal
    total_amount: Decimal
    payment_method: str
    status: str
    created_at: datetime
    items: list[SaleItemRead]

    model_config = ConfigDict(from_attributes=True)


class SaleListResponse(BaseModel):
    items: list[SaleRead]
    total: int
    skip: int
    limit: int
