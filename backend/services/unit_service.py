from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.unit import Unit
from schemas.unit import UnitCreate, UnitUpdate


def create_unit(db: Session, unit_in: UnitCreate) -> Unit:
    unit = Unit(**unit_in.model_dump())
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


def get_unit(db: Session, unit_id: int) -> Unit:
    unit = db.query(Unit).filter(Unit.unit_id == unit_id).first()
    if unit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found.")
    return unit


def list_units(db: Session, active_only: bool = True) -> list[Unit]:
    query = db.query(Unit)
    if active_only:
        query = query.filter(Unit.is_active.is_(True))
    return query.order_by(Unit.unit_name).all()


def update_unit(db: Session, unit_id: int, unit_in: UnitUpdate) -> Unit:
    unit = get_unit(db, unit_id)
    for field, value in unit_in.model_dump(exclude_unset=True).items():
        setattr(unit, field, value)
    db.commit()
    db.refresh(unit)
    return unit


def set_unit_status(db: Session, unit_id: int, is_active: bool) -> Unit:
    unit = get_unit(db, unit_id)
    unit.is_active = is_active
    db.commit()
    db.refresh(unit)
    return unit
