from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from database.session import get_db
from schemas.ai import (
    AIRecommendationListResponse,
    AIRecommendationRead,
    DemandForecastResponse,
    LowStockItem,
    RestockSuggestion,
    SalesTrendResponse,
)
from services import ai_heuristics, ai_service

router = APIRouter(prefix="/ai", tags=["AI Module"], dependencies=[Depends(get_current_user)])


# --- Heuristic endpoints: no external dependency, work immediately ---


@router.get("/low-stock-analysis", response_model=list[LowStockItem])
def low_stock_analysis(db: Session = Depends(get_db)) -> list[LowStockItem]:
    return ai_heuristics.low_stock_products(db)


@router.get("/restocking-suggestions", response_model=list[RestockSuggestion])
def restocking_suggestions(
    lookback_days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> list[RestockSuggestion]:
    return ai_heuristics.restocking_suggestions(db, lookback_days=lookback_days)


@router.get("/sales-trends", response_model=SalesTrendResponse)
def sales_trends(
    product_id: int | None = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> SalesTrendResponse:
    return ai_heuristics.sales_trend(db, product_id=product_id, days=days)


@router.get("/demand-forecast/{product_id}", response_model=DemandForecastResponse)
def demand_forecast(
    product_id: int,
    forecast_days: int = Query(default=30, ge=1, le=365),
    lookback_days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> DemandForecastResponse:
    return ai_heuristics.demand_forecast(
        db, product_id, forecast_days=forecast_days, lookback_days=lookback_days
    )


# --- Gemini-powered endpoint: requires GEMINI_API_KEY in .env ---


@router.post(
    "/generate-insight/{product_id}",
    response_model=AIRecommendationRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_insight(product_id: int, db: Session = Depends(get_db)) -> AIRecommendationRead:
    """
    Uses Gemini to turn the heuristic analysis into a natural-language
    recommendation and stores it. Returns 503 if GEMINI_API_KEY isn't
    configured, 502 if the Gemini API call itself fails.

    NOTE: this endpoint could not be tested end-to-end in the environment
    this project was built in (no outbound access to Google's API there).
    Verify it on your own machine once you have a Gemini API key.
    """
    return ai_service.generate_ai_insight(db, product_id)


@router.get("/recommendations", response_model=AIRecommendationListResponse)
def list_recommendations(
    product_id: int | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> AIRecommendationListResponse:
    items, total = ai_service.list_recommendations(db, product_id=product_id, skip=skip, limit=limit)
    return AIRecommendationListResponse(items=items, total=total, skip=skip, limit=limit)
