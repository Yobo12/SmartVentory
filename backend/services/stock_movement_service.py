from sqlalchemy.orm import Session

from models.stock_movement import StockMovement


def list_stock_movements(
    db: Session, product_id: int | None = None, skip: int = 0, limit: int = 50
) -> tuple[list[StockMovement], int]:
    """Read-only audit trail view — StockMovement rows are only ever
    created by purchase_service / sale_service, never edited directly."""
    query = db.query(StockMovement)
    if product_id is not None:
        query = query.filter(StockMovement.product_id == product_id)
    total = query.count()
    items = (
        query.order_by(StockMovement.movement_date.desc(), StockMovement.movement_id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total
