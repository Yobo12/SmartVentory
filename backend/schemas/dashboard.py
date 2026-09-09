from decimal import Decimal

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    total_products: int
    total_stock_units: Decimal
    total_inventory_value: Decimal
    low_stock_count: int
    today_sales_count: int
    today_sales_total: Decimal
    monthly_sales_count: int
    monthly_sales_total: Decimal
