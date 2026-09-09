from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from schemas.product import ProductRead


class InventoryRead(BaseModel):
    inventory_id: int
    product_id: int
    current_stock: Decimal
    maximum_stock: Decimal | None
    reorder_level: Decimal | None
    last_updated: datetime
    product: ProductRead

    model_config = ConfigDict(from_attributes=True)


class InventoryListResponse(BaseModel):
    items: list[InventoryRead]
    total: int
    skip: int
    limit: int


class InventorySettingsUpdate(BaseModel):
    """For PATCH /inventory/{product_id}/settings — the ONE exception to
    inventory being read-only. current_stock is deliberately NOT here:
    that still only ever changes via Purchases/Sales, so every stock
    change keeps its StockMovement audit record. reorder_level and
    maximum_stock are configuration, not stock movement, so they're
    safe to edit directly. Both optional (PATCH-style) — provide either
    or both."""

    reorder_level: Decimal | None = None
    maximum_stock: Decimal | None = None
