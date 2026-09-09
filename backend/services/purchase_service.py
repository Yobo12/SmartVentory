from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.inventory import Inventory
from models.product import Product
from models.purchase import Purchase
from models.purchase_item import PurchaseItem
from models.stock_movement import StockMovement
from models.supplier import Supplier
from schemas.purchase import PurchaseCreate


def create_purchase(db: Session, purchase_in: PurchaseCreate, current_user_id: int) -> Purchase:
    """
    Creates a Purchase with its line items, increases Inventory.current_stock
    for each product, and logs a StockMovement per item — all as one
    database transaction. If anything fails partway (bad product_id, etc.),
    everything rolls back together; nothing is left half-applied.
    """
    supplier = db.query(Supplier).filter(Supplier.supplier_id == purchase_in.supplier_id).first()
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found.")

    purchase = Purchase(
        supplier_id=purchase_in.supplier_id,
        user_id=current_user_id,
        purchase_date=purchase_in.purchase_date,
        total_cost=Decimal("0"),
        status="completed",
    )
    db.add(purchase)

    try:
        db.flush()  # assigns purchase.purchase_id without committing yet

        total_cost = Decimal("0")
        for item_in in purchase_in.items:
            product = db.query(Product).filter(Product.product_id == item_in.product_id).first()
            if product is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Product {item_in.product_id} not found.",
                )

            subtotal = item_in.quantity * item_in.unit_cost
            total_cost += subtotal

            db.add(
                PurchaseItem(
                    purchase_id=purchase.purchase_id,
                    product_id=item_in.product_id,
                    quantity=item_in.quantity,
                    unit_cost=item_in.unit_cost,
                    subtotal=subtotal,
                )
            )

            inventory = db.query(Inventory).filter(Inventory.product_id == item_in.product_id).first()
            if inventory is None:
                # Should never happen — every product gets an Inventory row
                # on creation (see product_service.create_product).
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Inventory record missing for product {item_in.product_id}.",
                )
            inventory.current_stock += item_in.quantity

            db.add(
                StockMovement(
                    product_id=item_in.product_id,
                    user_id=current_user_id,
                    movement_type="purchase_in",
                    quantity=item_in.quantity,
                    reason="Stock received from purchase",
                    reference_number=f"PUR-{purchase.purchase_id}",
                )
            )

        purchase.total_cost = total_cost
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(purchase)
    return purchase


def get_purchase(db: Session, purchase_id: int) -> Purchase:
    purchase = db.query(Purchase).filter(Purchase.purchase_id == purchase_id).first()
    if purchase is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found.")
    return purchase


def list_purchases(
    db: Session, supplier_id: int | None = None, skip: int = 0, limit: int = 50
) -> tuple[list[Purchase], int]:
    query = db.query(Purchase)
    if supplier_id is not None:
        query = query.filter(Purchase.supplier_id == supplier_id)
    total = query.count()
    items = query.order_by(Purchase.purchase_date.desc(), Purchase.purchase_id.desc()).offset(skip).limit(limit).all()
    return items, total
