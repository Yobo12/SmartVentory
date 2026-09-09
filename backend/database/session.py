"""
Database session management.

Defines the SQLAlchemy engine, session factory, and the declarative Base
that all ORM models (Phase 2) will inherit from.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config.settings import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # avoids stale connections after DB idle timeouts
    echo=settings.DEBUG,  # logs SQL statements when DEBUG=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""

    pass


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session and guarantees
    it is closed after the request, even if an exception occurs.

    Usage:
        @router.get("/products")
        def list_products(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
