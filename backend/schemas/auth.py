from pydantic import BaseModel


class Token(BaseModel):
    """Response body returned by POST /auth/login."""

    access_token: str
    token_type: str = "bearer"
