from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from database.session import get_db
from models.user import User
from schemas.sale import SaleCreate, SaleListResponse, SaleRead
from services import sale_service

# Any authenticated user (Admin or Staff) can record sales — day-to-day
# operational work, not catalog management (see Phase 5 note).
router = APIRouter(prefix="/sales", tags=["Sales"], dependencies=[Depends(get_current_user)])


@router.post("", response_model=SaleRead, status_code=status.HTTP_201_CREATED)
def create_sale(
    sale_in: SaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SaleRead:
    """Recording a sale decreases Inventory.current_stock for every line
    item and logs a StockMovement, atomically. Rejected in full if any
    item would sell more than the current stock on hand."""
    return sale_service.create_sale(db, sale_in, current_user.user_id)


@router.get("", response_model=SaleListResponse)
def list_sales(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> SaleListResponse:
    items, total = sale_service.list_sales(db, skip=skip, limit=limit)
    return SaleListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/{sale_id}", response_model=SaleRead)
def get_sale(sale_id: int, db: Session = Depends(get_db)) -> SaleRead:
    return sale_service.get_sale(db, sale_id)
