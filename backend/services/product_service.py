from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.category import Category
from models.inventory import Inventory
from models.product import Product
from models.supplier import Supplier
from models.unit import Unit
from schemas.product import ProductCreate, ProductUpdate


def _validate_foreign_keys(db: Session, category_id: int, supplier_id: int, unit_id: int) -> None:
    """Friendly 404s instead of a raw database foreign-key error."""
    if db.query(Category).filter(Category.category_id == category_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    if db.query(Supplier).filter(Supplier.supplier_id == supplier_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found.")
    if db.query(Unit).filter(Unit.unit_id == unit_id).first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found.")


def create_product(db: Session, product_in: ProductCreate) -> Product:
    _validate_foreign_keys(db, product_in.category_id, product_in.supplier_id, product_in.unit_id)

    existing_sku = db.query(Product).filter(Product.sku == product_in.sku).first()
    if existing_sku is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SKU already exists.")

    product = Product(**product_in.model_dump(), status="active")
    db.add(product)
    db.flush()  # assigns product.product_id without ending the transaction

    # Every product must have a paired Inventory row — Inventory is the
    # single source of truth for stock (see Phase 2 decision). Starts at 0;
    # actual stock arrives via Purchases in Phase 5.
    inventory = Inventory(product_id=product.product_id, current_stock=0)
    db.add(inventory)

    db.commit()
    db.refresh(product)
    return product


def get_product(db: Session, product_id: int) -> Product:
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return product


def list_products(
    db: Session,
    search: str | None = None,
    category_id: int | None = None,
    active_only: bool = True,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[Product], int]:
    """Returns (items, total_count) for pagination."""
    query = db.query(Product)

    if active_only:
        query = query.filter(Product.status == "active")
    if category_id is not None:
        query = query.filter(Product.category_id == category_id)
    if search:
        like_pattern = f"%{search}%"
        query = query.filter(
            or_(Product.product_name.ilike(like_pattern), Product.sku.ilike(like_pattern))
        )

    total = query.count()
    items = query.order_by(Product.product_name).offset(skip).limit(limit).all()
    return items, total


def update_product(db: Session, product_id: int, product_in: ProductUpdate) -> Product:
    product = get_product(db, product_id)
    update_data = product_in.model_dump(exclude_unset=True)

    if "sku" in update_data and update_data["sku"] != product.sku:
        existing_sku = db.query(Product).filter(Product.sku == update_data["sku"]).first()
        if existing_sku is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SKU already exists.")

    _validate_foreign_keys(
        db,
        update_data.get("category_id", product.category_id),
        update_data.get("supplier_id", product.supplier_id),
        update_data.get("unit_id", product.unit_id),
    )

    for field, value in update_data.items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


def set_product_status(db: Session, product_id: int, new_status: str) -> Product:
    product = get_product(db, product_id)
    product.status = new_status
    db.commit()
    db.refresh(product)
    return product
