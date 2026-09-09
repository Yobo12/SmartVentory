from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.category import Category
from schemas.category import CategoryCreate, CategoryUpdate


def create_category(db: Session, category_in: CategoryCreate) -> Category:
    category = Category(**category_in.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def get_category(db: Session, category_id: int) -> Category:
    category = db.query(Category).filter(Category.category_id == category_id).first()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    return category


def list_categories(db: Session, active_only: bool = True) -> list[Category]:
    query = db.query(Category)
    if active_only:
        query = query.filter(Category.is_active.is_(True))
    return query.order_by(Category.category_name).all()


def update_category(db: Session, category_id: int, category_in: CategoryUpdate) -> Category:
    category = get_category(db, category_id)
    for field, value in category_in.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


def set_category_status(db: Session, category_id: int, is_active: bool) -> Category:
    category = get_category(db, category_id)
    category.is_active = is_active
    db.commit()
    db.refresh(category)
    return category
