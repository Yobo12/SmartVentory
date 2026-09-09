from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.session import Base

if TYPE_CHECKING:
    from models.product import Product


class AIRecommendation(Base):
    """AI-generated inventory recommendations (restocking suggestions,
    demand forecasts, etc.) — populated by the AI module in Phase 7."""

    __tablename__ = "ai_recommendations"

    recommendation_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"), nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    product: Mapped["Product"] = relationship(back_populates="ai_recommendations")
