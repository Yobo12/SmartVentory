from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CategoryBase(BaseModel):
    category_name: str = Field(min_length=1, max_length=100)
    description: str | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    category_name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None


class CategoryRead(CategoryBase):
    category_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
