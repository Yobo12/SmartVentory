from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.inventory import Inventory
from schemas.inventory import InventorySettingsUpdate


def get_inventory_by_product(db: Session, product_id: int) -> Inventory:
    inventory = db.query(Inventory).filter(Inventory.product_id == product_id).first()
    if inventory is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory record not found for this product."
        )
    return inventory


def update_inventory_settings(db: Session, product_id: int, settings_in: InventorySettingsUpdate) -> Inventory:
    """The one write path into Inventory. Only touches reorder_level and
    maximum_stock — current_stock is untouched here on purpose, since it
    must only ever change via Purchases/Sales (see this module's other
    functions' docstrings, and routers/inventory.py's top comment)."""
    inventory = get_inventory_by_product(db, product_id)

    update_data = settings_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(inventory, field, value)

    db.commit()
    db.refresh(inventory)
    return inventory


def list_inventory(db: Session, skip: int = 0, limit: int = 50) -> tuple[list[Inventory], int]:
    query = db.query(Inventory)
    total = query.count()
    items = query.order_by(Inventory.inventory_id).offset(skip).limit(limit).all()
    return items, total


def list_low_stock(db: Session, skip: int = 0, limit: int = 50) -> tuple[list[Inventory], int]:
    """
    Items at or below their reorder level. Items with no reorder_level set
    are excluded — there's nothing to compare against.
    """
    query = db.query(Inventory).filter(
        Inventory.reorder_level.isnot(None),
        Inventory.current_stock <= Inventory.reorder_level,
    )
    total = query.count()
    items = query.order_by(Inventory.current_stock).offset(skip).limit(limit).all()
    return items, total
