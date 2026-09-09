from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from schemas.product import ProductBrief


class StockMovementRead(BaseModel):
    movement_id: int
    product_id: int
    user_id: int
    movement_type: str
    quantity: Decimal
    reason: str | None
    reference_number: str | None
    movement_date: datetime
    product: ProductBrief

    model_config = ConfigDict(from_attributes=True)


class StockMovementListResponse(BaseModel):
    items: list[StockMovementRead]
    total: int
    skip: int
    limit: int
