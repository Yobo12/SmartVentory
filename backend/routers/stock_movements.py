from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from database.session import get_db
from schemas.stock_movement import StockMovementListResponse
from services import stock_movement_service

router = APIRouter(
    prefix="/stock-movements", tags=["Stock Movements"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=StockMovementListResponse)
def list_stock_movements(
    product_id: int | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> StockMovementListResponse:
    """The audit trail: every stock change ever made, with the reason and
    who made it. Filter by product_id to see one product's full history."""
    items, total = stock_movement_service.list_stock_movements(
        db, product_id=product_id, skip=skip, limit=limit
    )
    return StockMovementListResponse(items=items, total=total, skip=skip, limit=limit)
