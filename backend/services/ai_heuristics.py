"""
Rule-based (non-AI) analysis functions. These compute directly from
Purchases/Sales/Inventory data with no external API dependency, so they
work immediately and are fully testable. Per PCD roadmap: "Demand
forecasting (simple heuristic or AI-assisted)" — this is the heuristic
half; services/gemini_client.py + services/ai_service.py add the
AI-assisted natural-language layer on top.
"""

from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.inventory import Inventory
from models.product import Product
from models.sale import Sale
from models.sale_item import SaleItem


def _get_product_or_404(db: Session, product_id: int) -> Product:
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return product


def low_stock_products(db: Session) -> list[dict]:
    rows = (
        db.query(Product, Inventory)
        .join(Inventory, Inventory.product_id == Product.product_id)
        .filter(
            Product.status == "active",
            Inventory.reorder_level.isnot(None),
            Inventory.current_stock <= Inventory.reorder_level,
        )
        .all()
    )
    return [
        {
            "product_id": p.product_id,
            "product_name": p.product_name,
            "sku": p.sku,
            "current_stock": inv.current_stock,
            "reorder_level": inv.reorder_level,
            "maximum_stock": inv.maximum_stock,
        }
        for p, inv in rows
    ]


def average_daily_sales(db: Session, product_id: int, lookback_days: int = 30) -> Decimal:
    start = date.today() - timedelta(days=lookback_days)
    total_sold = (
        db.query(func.coalesce(func.sum(SaleItem.quantity), 0))
        .join(Sale, Sale.sale_id == SaleItem.sale_id)
        .filter(SaleItem.product_id == product_id, Sale.sale_date >= start)
        .scalar()
    )
    return Decimal(total_sold) / Decimal(lookback_days)


def restocking_suggestions(db: Session, lookback_days: int = 30) -> list[dict]:
    """
    For each low-stock product, suggests a restock quantity: enough to
    reach maximum_stock if one is set, otherwise a 2-week buffer based on
    recent average daily sales pace.
    """
    suggestions = []
    for item in low_stock_products(db):
        avg_daily = average_daily_sales(db, item["product_id"], lookback_days)

        if item["maximum_stock"] is not None:
            suggested_qty = max(item["maximum_stock"] - item["current_stock"], Decimal("0"))
        else:
            suggested_qty = avg_daily * 14

        suggestions.append(
            {
                **item,
                "average_daily_sales": avg_daily.quantize(Decimal("0.0001")),
                "suggested_restock_quantity": suggested_qty.quantize(Decimal("0.01")),
            }
        )
    return suggestions


def sales_trend(db: Session, product_id: int | None = None, days: int = 30) -> dict:
    """Compares total sales in the last `days` vs the `days` before that,
    for one product or store-wide (product_id=None)."""
    if product_id is not None:
        _get_product_or_404(db, product_id)

    today = date.today()
    current_start = today - timedelta(days=days)
    previous_start = current_start - timedelta(days=days)
    tomorrow = today + timedelta(days=1)  # so today's sales are included (< end, not <= end)

    def _totals(start: date, end: date) -> tuple[Decimal, Decimal]:
        query = (
            db.query(
                func.coalesce(func.sum(SaleItem.quantity), 0),
                func.coalesce(func.sum(SaleItem.subtotal), 0),
            )
            .join(Sale, Sale.sale_id == SaleItem.sale_id)
            .filter(Sale.sale_date >= start, Sale.sale_date < end)
        )
        if product_id is not None:
            query = query.filter(SaleItem.product_id == product_id)
        qty, revenue = query.first()
        return Decimal(qty), Decimal(revenue)

    current_qty, current_revenue = _totals(current_start, tomorrow)
    previous_qty, previous_revenue = _totals(previous_start, current_start)

    if previous_revenue > 0:
        change_percent = ((current_revenue - previous_revenue) / previous_revenue) * 100
        change_percent = change_percent.quantize(Decimal("0.01"))
    else:
        change_percent = None  # can't compute a meaningful % change from a zero base

    return {
        "product_id": product_id,
        "period_days": days,
        "current_period_quantity": current_qty,
        "current_period_revenue": current_revenue,
        "previous_period_quantity": previous_qty,
        "previous_period_revenue": previous_revenue,
        "change_percent": change_percent,
    }


def demand_forecast(
    db: Session, product_id: int, forecast_days: int = 30, lookback_days: int = 30
) -> dict:
    """Simple moving-average forecast: assumes the near future sells at
    the same daily pace as the recent lookback period."""
    _get_product_or_404(db, product_id)
    avg_daily = average_daily_sales(db, product_id, lookback_days)
    forecasted_quantity = (avg_daily * forecast_days).quantize(Decimal("0.01"))
    return {
        "product_id": product_id,
        "lookback_days": lookback_days,
        "forecast_days": forecast_days,
        "average_daily_sales": avg_daily.quantize(Decimal("0.0001")),
        "forecasted_quantity": forecasted_quantity,
    }
