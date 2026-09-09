from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from database.session import get_db
from schemas.dashboard import DashboardSummary
from services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"], dependencies=[Depends(get_current_user)])


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(db: Session = Depends(get_db)) -> DashboardSummary:
    """The at-a-glance numbers a manager checks first: product count,
    total stock and its value, low-stock alerts, and today's/this month's
    sales performance."""
    return dashboard_service.get_dashboard_summary(db)
