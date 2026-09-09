from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class SalesReportSummary(BaseModel):
    start_date: date
    end_date: date
    total_sales_count: int
    total_revenue: Decimal
    total_discount: Decimal
    total_tax: Decimal


class PurchaseReportSummary(BaseModel):
    start_date: date
    end_date: date
    total_purchases_count: int
    total_cost: Decimal


class InventoryReportItem(BaseModel):
    product_id: int
    product_name: str
    sku: str
    current_stock: Decimal
    cost_price: Decimal
    selling_price: Decimal
    stock_value: Decimal  # current_stock * cost_price


class InventoryReportResponse(BaseModel):
    items: list[InventoryReportItem]
    total_products: int
    total_stock_value: Decimal


class ProductPerformanceItem(BaseModel):
    product_id: int
    product_name: str
    sku: str
    quantity_sold: Decimal
    revenue: Decimal


class ProductPerformanceResponse(BaseModel):
    start_date: date
    end_date: date
    items: list[ProductPerformanceItem]
