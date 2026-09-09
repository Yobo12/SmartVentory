from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.inventory import Inventory
from models.product import Product
from models.sale import Sale
from models.sale_item import SaleItem
from models.stock_movement import StockMovement
from schemas.sale import SaleCreate


def create_sale(db: Session, sale_in: SaleCreate, current_user_id: int) -> Sale:
    """
    Creates a Sale with its line items, decreases Inventory.current_stock
    for each product, and logs a StockMovement per item — all as one
    database transaction.

    A sale is rejected in full if ANY line item would sell more than the
    current stock on hand (per Phase 5 decision — no negative stock).
    """
    sale = Sale(
        user_id=current_user_id,
        sale_date=sale_in.sale_date,
        subtotal=Decimal("0"),
        discount=sale_in.discount,
        tax=sale_in.tax,
        total_amount=Decimal("0"),
        payment_method=sale_in.payment_method,
        status="completed",
    )
    db.add(sale)

    try:
        db.flush()  # assigns sale.sale_id without committing yet

        subtotal_total = Decimal("0")
        for item_in in sale_in.items:
            product = db.query(Product).filter(Product.product_id == item_in.product_id).first()
            if product is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Product {item_in.product_id} not found.",
                )
            if product.status != "active":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Product '{product.product_name}' is not active and cannot be sold.",
                )

            inventory = db.query(Inventory).filter(Inventory.product_id == item_in.product_id).first()
            if inventory is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Inventory record missing for product {item_in.product_id}.",
                )

            if item_in.quantity > inventory.current_stock:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Insufficient stock for '{product.product_name}': "
                        f"requested {item_in.quantity}, available {inventory.current_stock}."
                    ),
                )

            unit_price = item_in.unit_price if item_in.unit_price is not None else product.selling_price
            item_subtotal = item_in.quantity * unit_price
            subtotal_total += item_subtotal

            db.add(
                SaleItem(
                    sale_id=sale.sale_id,
                    product_id=item_in.product_id,
                    quantity=item_in.quantity,
                    unit_price=unit_price,
                    subtotal=item_subtotal,
                )
            )

            inventory.current_stock -= item_in.quantity

            db.add(
                StockMovement(
                    product_id=item_in.product_id,
                    user_id=current_user_id,
                    movement_type="sale_out",
                    quantity=item_in.quantity,
                    reason="Stock sold",
                    reference_number=f"SALE-{sale.sale_id}",
                )
            )

        sale.subtotal = subtotal_total
        sale.total_amount = subtotal_total - sale_in.discount + sale_in.tax
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(sale)
    return sale


def get_sale(db: Session, sale_id: int) -> Sale:
    sale = db.query(Sale).filter(Sale.sale_id == sale_id).first()
    if sale is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sale not found.")
    return sale


def list_sales(db: Session, skip: int = 0, limit: int = 50) -> tuple[list[Sale], int]:
    query = db.query(Sale)
    total = query.count()
    items = query.order_by(Sale.sale_date.desc(), Sale.sale_id.desc()).offset(skip).limit(limit).all()
    return items, total
