"""
Shared column mixins for SQLAlchemy models.

Using mixins avoids repeating identical created_at / updated_at column
definitions in every model file. Both timestamps are set by the database
itself (server_default), not by application code, so they're always
accurate even if multiple app instances have clock drift.
"""

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    """For tables with both CreatedAt and UpdatedAt (per ERD)."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class CreatedAtMixin:
    """For tables with only CreatedAt (per ERD) — no update tracking."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
