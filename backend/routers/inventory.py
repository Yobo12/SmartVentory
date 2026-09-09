from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, require_role
from database.session import get_db
from schemas.inventory import InventoryListResponse, InventoryRead, InventorySettingsUpdate
from services import inventory_service

# Stock levels (current_stock) are read-only here by design — actual
# stock changes are driven by Purchases and Sales, never edited
# directly, so every change always has a matching StockMovement audit
# record. The ONE exception is PATCH /{product_id}/settings below,
# which only touches reorder_level/maximum_stock — configuration
# values, not stock movements — restricted to Admins, same as other
# catalog-configuration endpoints (Products, Categories, etc).
router = APIRouter(prefix="/inventory", tags=["Inventory"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=InventoryListResponse)
def list_inventory(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> InventoryListResponse:
    items, total = inventory_service.list_inventory(db, skip=skip, limit=limit)
    return InventoryListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/low-stock", response_model=InventoryListResponse)
def list_low_stock(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> InventoryListResponse:
    """Products at or below their reorder level — the low-stock alert
    view called for in PCD scope."""
    items, total = inventory_service.list_low_stock(db, skip=skip, limit=limit)
    return InventoryListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/{product_id}", response_model=InventoryRead)
def get_inventory_for_product(product_id: int, db: Session = Depends(get_db)) -> InventoryRead:
    return inventory_service.get_inventory_by_product(db, product_id)


@router.patch(
    "/{product_id}/settings",
    response_model=InventoryRead,
    dependencies=[Depends(require_role("Admin"))],
)
def update_inventory_settings(
    product_id: int, settings_in: InventorySettingsUpdate, db: Session = Depends(get_db)
) -> InventoryRead:
    """Sets reorder_level and/or maximum_stock for a product. Does NOT
    touch current_stock — that only ever changes via Purchases/Sales,
    see this router's top comment."""
    return inventory_service.update_inventory_settings(db, product_id, settings_in)
