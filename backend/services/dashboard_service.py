from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.inventory import Inventory
from models.product import Product
from models.sale import Sale


def get_dashboard_summary(db: Session) -> dict:
    today = date.today()
    month_start = today.replace(day=1)

    total_products = db.query(Product).filter(Product.status == "active").count()

    total_stock_units = db.query(func.coalesce(func.sum(Inventory.current_stock), 0)).scalar()

    total_inventory_value = (
        db.query(func.coalesce(func.sum(Inventory.current_stock * Product.cost_price), 0))
        .join(Product, Product.product_id == Inventory.product_id)
        .scalar()
    )

    low_stock_count = (
        db.query(Inventory)
        .filter(Inventory.reorder_level.isnot(None), Inventory.current_stock <= Inventory.reorder_level)
        .count()
    )

    today_sales_count = db.query(Sale).filter(Sale.sale_date == today).count()
    today_sales_total = (
        db.query(func.coalesce(func.sum(Sale.total_amount), 0)).filter(Sale.sale_date == today).scalar()
    )

    monthly_sales_count = (
        db.query(Sale).filter(Sale.sale_date >= month_start, Sale.sale_date <= today).count()
    )
    monthly_sales_total = (
        db.query(func.coalesce(func.sum(Sale.total_amount), 0))
        .filter(Sale.sale_date >= month_start, Sale.sale_date <= today)
        .scalar()
    )

    return {
        "total_products": total_products,
        "total_stock_units": total_stock_units,
        "total_inventory_value": total_inventory_value,
        "low_stock_count": low_stock_count,
        "today_sales_count": today_sales_count,
        "today_sales_total": today_sales_total,
        "monthly_sales_count": monthly_sales_count,
        "monthly_sales_total": monthly_sales_total,
    }
