"""
Shared FastAPI dependencies for protected routes.

get_current_user:  extracts the Bearer token from the Authorization header,
                    verifies it, and loads the corresponding User from the DB.
require_role(...): a dependency FACTORY — call it with allowed role names
                    to build a dependency that also enforces RBAC.

Usage in a router:
    @router.get("/reports")
    def get_reports(current_user: User = Depends(get_current_user)):
        ...  # any authenticated user

    @router.post("/users", dependencies=[Depends(require_role("Admin"))])
    def create_user(...):
        ...  # Admins only
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from auth.security import JWTError, decode_access_token
from config.settings import settings
from database.session import get_db
from models.user import User

# tokenUrl tells FastAPI's auto-generated docs (/docs) where to send the
# login form — it does not affect actual token verification.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        user_id_raw = payload.get("sub")
        if user_id_raw is None:
            raise credentials_exception
        user_id = int(user_id_raw)
    except (JWTError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.user_id == user_id).first()
    if user is None:
        raise credentials_exception
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )
    return user


def require_role(*allowed_roles: str):
    """
    Dependency factory for role-based authorization.
    Example: dependencies=[Depends(require_role("Admin"))]
    """

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.role_name not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return role_checker
