from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from database.session import get_db
from models.user import User
from schemas.purchase import PurchaseCreate, PurchaseListResponse, PurchaseRead
from services import purchase_service

# Any authenticated user (Admin or Staff) can record purchases — this is
# day-to-day operational work, not catalog management (see Phase 5 note).
router = APIRouter(prefix="/purchases", tags=["Purchases"], dependencies=[Depends(get_current_user)])


@router.post("", response_model=PurchaseRead, status_code=status.HTTP_201_CREATED)
def create_purchase(
    purchase_in: PurchaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PurchaseRead:
    """Recording a purchase increases Inventory.current_stock for every
    line item and logs a StockMovement, atomically."""
    return purchase_service.create_purchase(db, purchase_in, current_user.user_id)


@router.get("", response_model=PurchaseListResponse)
def list_purchases(
    supplier_id: int | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> PurchaseListResponse:
    items, total = purchase_service.list_purchases(db, supplier_id=supplier_id, skip=skip, limit=limit)
    return PurchaseListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/{purchase_id}", response_model=PurchaseRead)
def get_purchase(purchase_id: int, db: Session = Depends(get_db)) -> PurchaseRead:
    return purchase_service.get_purchase(db, purchase_id)
