"""Business logic for user management (Admin-only). Per PCD section 12,
business logic lives in services/, not in routers/."""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from auth.security import hash_password
from models.user import User
from schemas.user import UserCreate, UserUpdate


def create_user(db: Session, user_in: UserCreate) -> User:
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )

    user = User(
        role_id=user_in.role_id,
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        email=user_in.email,
        phone=user_in.phone,
        password_hash=hash_password(user_in.password),
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.user_id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


def list_users(db: Session, skip: int = 0, limit: int = 50) -> list[User]:
    return db.query(User).offset(skip).limit(limit).all()


def update_user(db: Session, user_id: int, user_in: UserUpdate) -> User:
    user = get_user(db, user_id)
    update_data = user_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def set_user_status(db: Session, user_id: int, new_status: str) -> User:
    user = get_user(db, user_id)
    user.status = new_status
    db.commit()
    db.refresh(user)
    return user
