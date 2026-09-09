from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.inventory import Inventory
from models.product import Product
from models.purchase import Purchase
from models.sale import Sale
from models.sale_item import SaleItem


def _validate_date_range(start_date: date, end_date: date) -> None:
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must not be after end_date.",
        )


def get_sales_report(db: Session, start_date: date, end_date: date) -> dict:
    _validate_date_range(start_date, end_date)
    date_filter = (Sale.sale_date >= start_date, Sale.sale_date <= end_date)

    total_sales_count = db.query(Sale).filter(*date_filter).count()
    totals = (
        db.query(
            func.coalesce(func.sum(Sale.total_amount), 0),
            func.coalesce(func.sum(Sale.discount), 0),
            func.coalesce(func.sum(Sale.tax), 0),
        )
        .filter(*date_filter)
        .first()
    )

    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_sales_count": total_sales_count,
        "total_revenue": totals[0],
        "total_discount": totals[1],
        "total_tax": totals[2],
    }


def get_purchase_report(db: Session, start_date: date, end_date: date) -> dict:
    _validate_date_range(start_date, end_date)
    date_filter = (Purchase.purchase_date >= start_date, Purchase.purchase_date <= end_date)

    total_purchases_count = db.query(Purchase).filter(*date_filter).count()
    total_cost = db.query(func.coalesce(func.sum(Purchase.total_cost), 0)).filter(*date_filter).scalar()

    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_purchases_count": total_purchases_count,
        "total_cost": total_cost,
    }


def get_inventory_report(db: Session) -> dict:
    """Current stock valuation for every active product — a snapshot, not
    date-ranged (inventory value only exists 'now', not historically,
    since we don't keep a valuation history table)."""
    rows = (
        db.query(Product, Inventory)
        .join(Inventory, Inventory.product_id == Product.product_id)
        .filter(Product.status == "active")
        .order_by(Product.product_name)
        .all()
    )

    items = []
    total_stock_value = Decimal("0")
    for product, inventory in rows:
        stock_value = inventory.current_stock * product.cost_price
        total_stock_value += stock_value
        items.append(
            {
                "product_id": product.product_id,
                "product_name": product.product_name,
                "sku": product.sku,
                "current_stock": inventory.current_stock,
                "cost_price": product.cost_price,
                "selling_price": product.selling_price,
                "stock_value": stock_value,
            }
        )

    return {"items": items, "total_products": len(items), "total_stock_value": total_stock_value}


def get_product_performance_report(
    db: Session, start_date: date, end_date: date, limit: int = 20
) -> dict:
    """Best-selling products by revenue within a date range — the same
    kind of query the AI module (Phase 7) will build on for demand
    forecasting."""
    _validate_date_range(start_date, end_date)

    rows = (
        db.query(
            Product.product_id,
            Product.product_name,
            Product.sku,
            func.coalesce(func.sum(SaleItem.quantity), 0).label("quantity_sold"),
            func.coalesce(func.sum(SaleItem.subtotal), 0).label("revenue"),
        )
        .join(SaleItem, SaleItem.product_id == Product.product_id)
        .join(Sale, Sale.sale_id == SaleItem.sale_id)
        .filter(Sale.sale_date >= start_date, Sale.sale_date <= end_date)
        .group_by(Product.product_id, Product.product_name, Product.sku)
        .order_by(func.sum(SaleItem.subtotal).desc())
        .limit(limit)
        .all()
    )

    items = [
        {
            "product_id": r.product_id,
            "product_name": r.product_name,
            "sku": r.sku,
            "quantity_sold": r.quantity_sold,
            "revenue": r.revenue,
        }
        for r in rows
    ]
    return {"start_date": start_date, "end_date": end_date, "items": items}
