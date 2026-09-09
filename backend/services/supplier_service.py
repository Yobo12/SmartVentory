from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.supplier import Supplier
from schemas.supplier import SupplierCreate, SupplierUpdate


def create_supplier(db: Session, supplier_in: SupplierCreate) -> Supplier:
    supplier = Supplier(**supplier_in.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


def get_supplier(db: Session, supplier_id: int) -> Supplier:
    supplier = db.query(Supplier).filter(Supplier.supplier_id == supplier_id).first()
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found.")
    return supplier


def list_suppliers(db: Session, active_only: bool = True) -> list[Supplier]:
    query = db.query(Supplier)
    if active_only:
        query = query.filter(Supplier.is_active.is_(True))
    return query.order_by(Supplier.company_name).all()


def update_supplier(db: Session, supplier_id: int, supplier_in: SupplierUpdate) -> Supplier:
    supplier = get_supplier(db, supplier_id)
    for field, value in supplier_in.model_dump(exclude_unset=True).items():
        setattr(supplier, field, value)
    db.commit()
    db.refresh(supplier)
    return supplier


def set_supplier_status(db: Session, supplier_id: int, is_active: bool) -> Supplier:
    supplier = get_supplier(db, supplier_id)
    supplier.is_active = is_active
    db.commit()
    db.refresh(supplier)
    return supplier
