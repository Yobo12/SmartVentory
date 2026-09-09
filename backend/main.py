"""
SmartVentory Backend — FastAPI Application Entrypoint.

Phase 1 (Backend Foundation) scope:
    - App instance creation
    - CORS configuration for the vanilla JS frontend
    - Health check + DB connectivity test endpoints

Routers for real modules (products, sales, etc.) are registered here from
Phase 4 onward — see routers/ package.
"""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from config.settings import settings
from database.session import get_db
from routers import (
    ai,
    auth,
    categories,
    dashboard,
    inventory,
    products,
    purchases,
    reports,
    roles,
    sales,
    stock_movements,
    suppliers,
    units,
    users,
)

app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Driven Inventory Management System for SMEs",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Health"])
def root() -> dict:
    """Basic liveness check — confirms the API process is running."""
    return {"app": settings.APP_NAME, "status": "running"}


@app.get("/health/db", tags=["Health"])
def health_check_db(db: Session = Depends(get_db)) -> dict:
    """
    Confirms the API can reach and query PostgreSQL.
    Used to validate Phase 1's 'database connection test' deliverable.
    """
    db.execute(text("SELECT 1"))
    return {"database": "connected"}


# --- Routers ---
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(roles.router, prefix=settings.API_V1_PREFIX)
app.include_router(categories.router, prefix=settings.API_V1_PREFIX)
app.include_router(suppliers.router, prefix=settings.API_V1_PREFIX)
app.include_router(units.router, prefix=settings.API_V1_PREFIX)
app.include_router(products.router, prefix=settings.API_V1_PREFIX)
app.include_router(inventory.router, prefix=settings.API_V1_PREFIX)
app.include_router(purchases.router, prefix=settings.API_V1_PREFIX)
app.include_router(sales.router, prefix=settings.API_V1_PREFIX)
app.include_router(stock_movements.router, prefix=settings.API_V1_PREFIX)
app.include_router(dashboard.router, prefix=settings.API_V1_PREFIX)
app.include_router(reports.router, prefix=settings.API_V1_PREFIX)
app.include_router(ai.router, prefix=settings.API_V1_PREFIX)
# Registered here as each subsequent module is built (Phase 8 onward — frontend
# doesn't add backend routers, but future backend additions go here):
