"""
Read-only roles lookup — added so the frontend's Add/Edit User form can
populate a role dropdown without hardcoding role IDs. No write endpoints:
roles (Admin, Staff) are fixed reference data seeded at setup, not
something the app lets anyone create or edit through the API.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import require_role
from database.session import get_db
from models.role import Role
from schemas.role import RoleRead

# Admin-only, same as /users — roles are only relevant to the
# Admin-only user-management screen.
router = APIRouter(
    prefix="/roles",
    tags=["Roles"],
    dependencies=[Depends(require_role("Admin"))],
)


@router.get("", response_model=list[RoleRead])
def list_roles(db: Session = Depends(get_db)) -> list[RoleRead]:
    return db.query(Role).order_by(Role.role_id).all()
