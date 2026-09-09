from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from database.session import get_db
from schemas.report import (
    InventoryReportResponse,
    ProductPerformanceResponse,
    PurchaseReportSummary,
    SalesReportSummary,
)
from services import report_service

router = APIRouter(prefix="/reports", tags=["Reports"], dependencies=[Depends(get_current_user)])


@router.get("/sales", response_model=SalesReportSummary)
def sales_report(
    start_date: date = Query(..., description="Inclusive start of the date range"),
    end_date: date = Query(..., description="Inclusive end of the date range"),
    db: Session = Depends(get_db),
) -> SalesReportSummary:
    return report_service.get_sales_report(db, start_date, end_date)


@router.get("/purchases", response_model=PurchaseReportSummary)
def purchase_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
) -> PurchaseReportSummary:
    return report_service.get_purchase_report(db, start_date, end_date)


@router.get("/inventory", response_model=InventoryReportResponse)
def inventory_report(db: Session = Depends(get_db)) -> InventoryReportResponse:
    """Current stock valuation snapshot — no date range, since this
    reflects stock levels right now, not a historical period."""
    return report_service.get_inventory_report(db)


@router.get("/product-performance", response_model=ProductPerformanceResponse)
def product_performance_report(
    start_date: date = Query(...),
    end_date: date = Query(...),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> ProductPerformanceResponse:
    """Best-selling products by revenue within the given date range."""
    return report_service.get_product_performance_report(db, start_date, end_date, limit=limit)
