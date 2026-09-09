from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.dependencies import require_role
from database.session import get_db
from schemas.user import UserCreate, UserRead, UserStatusUpdate, UserUpdate
from services import user_service

# Every route in this router requires the Admin role — no public
# registration exists in this system (see PCD scope / Phase 3 decision).
router = APIRouter(
    prefix="/users",
    tags=["User Management"],
    dependencies=[Depends(require_role("Admin"))],
)


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(user_in: UserCreate, db: Session = Depends(get_db)) -> UserRead:
    return user_service.create_user(db, user_in)


@router.get("", response_model=list[UserRead])
def list_users(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)) -> list[UserRead]:
    return user_service.list_users(db, skip=skip, limit=limit)


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: int, db: Session = Depends(get_db)) -> UserRead:
    return user_service.get_user(db, user_id)


@router.put("/{user_id}", response_model=UserRead)
def update_user(user_id: int, user_in: UserUpdate, db: Session = Depends(get_db)) -> UserRead:
    return user_service.update_user(db, user_id, user_in)


@router.patch("/{user_id}/status", response_model=UserRead)
def set_user_status(
    user_id: int, status_in: UserStatusUpdate, db: Session = Depends(get_db)
) -> UserRead:
    """Activate or deactivate a user account (soft delete — no user is
    ever hard-deleted, consistent with the Products module's soft-delete
    approach per PCD scope)."""
    return user_service.set_user_status(db, user_id, status_in.status)
