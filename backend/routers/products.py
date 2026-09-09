from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, require_role
from database.session import get_db
from schemas.product import ProductCreate, ProductListResponse, ProductRead, ProductUpdate
from services import product_service

router = APIRouter(prefix="/products", tags=["Products"])


@router.post(
    "",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("Admin"))],
)
def create_product(product_in: ProductCreate, db: Session = Depends(get_db)) -> ProductRead:
    return product_service.create_product(db, product_in)


@router.get("", response_model=ProductListResponse, dependencies=[Depends(get_current_user)])
def list_products(
    search: str | None = Query(default=None, description="Search by product name or SKU"),
    category_id: int | None = None,
    active_only: bool = True,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ProductListResponse:
    items, total = product_service.list_products(
        db, search=search, category_id=category_id, active_only=active_only, skip=skip, limit=limit
    )
    return ProductListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/{product_id}", response_model=ProductRead, dependencies=[Depends(get_current_user)])
def get_product(product_id: int, db: Session = Depends(get_db)) -> ProductRead:
    return product_service.get_product(db, product_id)


@router.put(
    "/{product_id}",
    response_model=ProductRead,
    dependencies=[Depends(require_role("Admin"))],
)
def update_product(product_id: int, product_in: ProductUpdate, db: Session = Depends(get_db)) -> ProductRead:
    return product_service.update_product(db, product_id, product_in)


@router.patch(
    "/{product_id}/deactivate",
    response_model=ProductRead,
    dependencies=[Depends(require_role("Admin"))],
)
def deactivate_product(product_id: int, db: Session = Depends(get_db)) -> ProductRead:
    """Soft delete — per PCD scope ('Delete (Soft Delete)'). The product
    row is never removed, so historical Sales/Purchases referencing it
    stay intact."""
    return product_service.set_product_status(db, product_id, new_status="inactive")


@router.patch(
    "/{product_id}/activate",
    response_model=ProductRead,
    dependencies=[Depends(require_role("Admin"))],
)
def activate_product(product_id: int, db: Session = Depends(get_db)) -> ProductRead:
    return product_service.set_product_status(db, product_id, new_status="active")
