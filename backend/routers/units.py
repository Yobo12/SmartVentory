from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, require_role
from database.session import get_db
from schemas.unit import UnitCreate, UnitRead, UnitUpdate
from services import unit_service

router = APIRouter(prefix="/units", tags=["Units"])


@router.post(
    "",
    response_model=UnitRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("Admin"))],
)
def create_unit(unit_in: UnitCreate, db: Session = Depends(get_db)) -> UnitRead:
    return unit_service.create_unit(db, unit_in)


@router.get("", response_model=list[UnitRead], dependencies=[Depends(get_current_user)])
def list_units(active_only: bool = True, db: Session = Depends(get_db)) -> list[UnitRead]:
    return unit_service.list_units(db, active_only=active_only)


@router.get("/{unit_id}", response_model=UnitRead, dependencies=[Depends(get_current_user)])
def get_unit(unit_id: int, db: Session = Depends(get_db)) -> UnitRead:
    return unit_service.get_unit(db, unit_id)


@router.put("/{unit_id}", response_model=UnitRead, dependencies=[Depends(require_role("Admin"))])
def update_unit(unit_id: int, unit_in: UnitUpdate, db: Session = Depends(get_db)) -> UnitRead:
    return unit_service.update_unit(db, unit_id, unit_in)


@router.patch(
    "/{unit_id}/deactivate",
    response_model=UnitRead,
    dependencies=[Depends(require_role("Admin"))],
)
def deactivate_unit(unit_id: int, db: Session = Depends(get_db)) -> UnitRead:
    return unit_service.set_unit_status(db, unit_id, is_active=False)


@router.patch(
    "/{unit_id}/activate",
    response_model=UnitRead,
    dependencies=[Depends(require_role("Admin"))],
)
def activate_unit(unit_id: int, db: Session = Depends(get_db)) -> UnitRead:
    return unit_service.set_unit_status(db, unit_id, is_active=True)
