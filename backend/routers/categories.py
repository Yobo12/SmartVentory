from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, require_role
from database.session import get_db
from schemas.category import CategoryCreate, CategoryRead, CategoryUpdate
from services import category_service

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.post(
    "",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("Admin"))],
)
def create_category(category_in: CategoryCreate, db: Session = Depends(get_db)) -> CategoryRead:
    return category_service.create_category(db, category_in)


@router.get("", response_model=list[CategoryRead], dependencies=[Depends(get_current_user)])
def list_categories(active_only: bool = True, db: Session = Depends(get_db)) -> list[CategoryRead]:
    return category_service.list_categories(db, active_only=active_only)


@router.get("/{category_id}", response_model=CategoryRead, dependencies=[Depends(get_current_user)])
def get_category(category_id: int, db: Session = Depends(get_db)) -> CategoryRead:
    return category_service.get_category(db, category_id)


@router.put(
    "/{category_id}",
    response_model=CategoryRead,
    dependencies=[Depends(require_role("Admin"))],
)
def update_category(
    category_id: int, category_in: CategoryUpdate, db: Session = Depends(get_db)
) -> CategoryRead:
    return category_service.update_category(db, category_id, category_in)


@router.patch(
    "/{category_id}/deactivate",
    response_model=CategoryRead,
    dependencies=[Depends(require_role("Admin"))],
)
def deactivate_category(category_id: int, db: Session = Depends(get_db)) -> CategoryRead:
    return category_service.set_category_status(db, category_id, is_active=False)


@router.patch(
    "/{category_id}/activate",
    response_model=CategoryRead,
    dependencies=[Depends(require_role("Admin"))],
)
def activate_category(category_id: int, db: Session = Depends(get_db)) -> CategoryRead:
    return category_service.set_category_status(db, category_id, is_active=True)
