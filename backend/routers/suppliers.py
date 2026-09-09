from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, require_role
from database.session import get_db
from schemas.supplier import SupplierCreate, SupplierRead, SupplierUpdate
from services import supplier_service

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.post(
    "",
    response_model=SupplierRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("Admin"))],
)
def create_supplier(supplier_in: SupplierCreate, db: Session = Depends(get_db)) -> SupplierRead:
    return supplier_service.create_supplier(db, supplier_in)


@router.get("", response_model=list[SupplierRead], dependencies=[Depends(get_current_user)])
def list_suppliers(active_only: bool = True, db: Session = Depends(get_db)) -> list[SupplierRead]:
    return supplier_service.list_suppliers(db, active_only=active_only)


@router.get("/{supplier_id}", response_model=SupplierRead, dependencies=[Depends(get_current_user)])
def get_supplier(supplier_id: int, db: Session = Depends(get_db)) -> SupplierRead:
    return supplier_service.get_supplier(db, supplier_id)


@router.put(
    "/{supplier_id}",
    response_model=SupplierRead,
    dependencies=[Depends(require_role("Admin"))],
)
def update_supplier(
    supplier_id: int, supplier_in: SupplierUpdate, db: Session = Depends(get_db)
) -> SupplierRead:
    return supplier_service.update_supplier(db, supplier_id, supplier_in)


@router.patch(
    "/{supplier_id}/deactivate",
    response_model=SupplierRead,
    dependencies=[Depends(require_role("Admin"))],
)
def deactivate_supplier(supplier_id: int, db: Session = Depends(get_db)) -> SupplierRead:
    return supplier_service.set_supplier_status(db, supplier_id, is_active=False)


@router.patch(
    "/{supplier_id}/activate",
    response_model=SupplierRead,
    dependencies=[Depends(require_role("Admin"))],
)
def activate_supplier(supplier_id: int, db: Session = Depends(get_db)) -> SupplierRead:
    return supplier_service.set_supplier_status(db, supplier_id, is_active=True)
