from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.ai_recommendation import AIRecommendation
from models.product import Product
from services import ai_heuristics
from services.gemini_client import GeminiNotConfiguredError, GeminiRequestError, generate_insight_text


def _build_prompt(product: Product, restock_info: dict, trend_info: dict) -> str:
    return (
        "You are an inventory analyst for a small retail business. "
        "Write a short (2-3 sentence), plain-language, actionable recommendation "
        "for the product below.\n\n"
        f"Product: {product.product_name} (SKU: {product.sku})\n"
        f"Current stock: {restock_info['current_stock']}\n"
        f"Reorder level: {restock_info['reorder_level']}\n"
        f"Suggested restock quantity: {restock_info['suggested_restock_quantity']}\n"
        f"Average daily sales (recent): {restock_info['average_daily_sales']}\n"
        f"Sales trend vs previous period: {trend_info['change_percent']}% change in revenue\n"
    )


def generate_ai_insight(db: Session, product_id: int) -> AIRecommendation:
    """
    Generates a natural-language recommendation for one product by
    combining heuristic analysis with a Gemini-generated summary, and
    stores the result. Requires GEMINI_API_KEY in .env — raises a clear
    503 if it's not configured, rather than crashing.
    """
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    restock_list = ai_heuristics.restocking_suggestions(db)
    restock_info = next((r for r in restock_list if r["product_id"] == product_id), None)
    if restock_info is None:
        # Product isn't currently low-stock — still generate a general insight.
        restock_info = {
            "current_stock": None,
            "reorder_level": None,
            "suggested_restock_quantity": Decimal("0.00"),
            "average_daily_sales": ai_heuristics.average_daily_sales(db, product_id),
        }

    trend_info = ai_heuristics.sales_trend(db, product_id=product_id)
    prompt = _build_prompt(product, restock_info, trend_info)

    try:
        recommendation_text = generate_insight_text(prompt)
    except GeminiNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except GeminiRequestError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    # Gemini doesn't return a confidence score natively — this is a
    # placeholder reflecting "recommendation was generated successfully",
    # not a statistical measure. Revisit if a more rigorous score is
    # needed for the final report.
    confidence_score = 0.75

    recommendation = AIRecommendation(
        product_id=product_id,
        recommendation=recommendation_text,
        confidence_score=confidence_score,
        status="active",
    )
    db.add(recommendation)
    db.commit()
    db.refresh(recommendation)
    return recommendation


def list_recommendations(
    db: Session, product_id: int | None = None, skip: int = 0, limit: int = 50
) -> tuple[list[AIRecommendation], int]:
    query = db.query(AIRecommendation)
    if product_id is not None:
        query = query.filter(AIRecommendation.product_id == product_id)
    total = query.count()
    items = (
        query.order_by(AIRecommendation.generated_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total
