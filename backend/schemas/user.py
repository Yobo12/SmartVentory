from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)


class UserCreate(UserBase):
    """Used by Admin-only POST /users. Plain-text password in, hashed
    before it ever touches the database — see services/user_service.py."""

    password: str = Field(min_length=8, max_length=128)
    role_id: int


class UserUpdate(BaseModel):
    """All fields optional — only provided fields are changed (PATCH-style
    behavior even though the route uses PUT for simplicity)."""

    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    role_id: int | None = None


class UserStatusUpdate(BaseModel):
    status: Literal["active", "inactive"]


class UserRead(UserBase):
    """What gets returned to the client — never includes password_hash."""

    user_id: int
    role_id: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
