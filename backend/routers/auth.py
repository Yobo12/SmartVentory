from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from database.session import get_db
from auth.security import create_access_token
from models.user import User
from schemas.auth import Token
from schemas.user import UserRead
from services.auth_service import authenticate_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    """
    Standard OAuth2 password-flow login.

    NOTE for frontend integration: the form field is named "username" by
    the OAuth2 spec, but submit the user's EMAIL in it — this API has no
    separate username, only email + password. Submit as
    application/x-www-form-urlencoded (not JSON).
    """
    user = authenticate_user(db, email=form_data.username, password=form_data.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=str(user.user_id), role=user.role.role_name)
    return Token(access_token=access_token)


@router.get("/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    """Returns the profile of whoever's token was sent — lets the frontend
    confirm login state and display the logged-in user's name/role."""
    return current_user
