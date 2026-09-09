from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class LowStockItem(BaseModel):
    product_id: int
    product_name: str
    sku: str
    current_stock: Decimal
    reorder_level: Decimal | None
    maximum_stock: Decimal | None


class RestockSuggestion(LowStockItem):
    average_daily_sales: Decimal
    suggested_restock_quantity: Decimal


class SalesTrendResponse(BaseModel):
    product_id: int | None
    period_days: int
    current_period_quantity: Decimal
    current_period_revenue: Decimal
    previous_period_quantity: Decimal
    previous_period_revenue: Decimal
    change_percent: Decimal | None


class DemandForecastResponse(BaseModel):
    product_id: int
    lookback_days: int
    forecast_days: int
    average_daily_sales: Decimal
    forecasted_quantity: Decimal


class AIRecommendationRead(BaseModel):
    recommendation_id: int
    product_id: int
    recommendation: str
    confidence_score: float | None
    generated_at: datetime
    status: str

    model_config = ConfigDict(from_attributes=True)


class AIRecommendationListResponse(BaseModel):
    items: list[AIRecommendationRead]
    total: int
    skip: int
    limit: int
