"""Business logic for authentication (login). Per PCD section 12, business
logic lives in services/, not in routers/."""

from sqlalchemy.orm import Session

from auth.security import verify_password
from models.user import User


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """
    Returns the User if the email/password are valid and the account is
    active, otherwise None. Callers (the login route) are responsible for
    turning None into an HTTP 401.
    """
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        return None
    if user.status != "active":
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
