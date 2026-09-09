from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UnitBase(BaseModel):
    unit_name: str = Field(min_length=1, max_length=50)
    symbol: str | None = Field(default=None, max_length=10)


class UnitCreate(UnitBase):
    pass


class UnitUpdate(BaseModel):
    unit_name: str | None = Field(default=None, min_length=1, max_length=50)
    symbol: str | None = Field(default=None, max_length=10)


class UnitRead(UnitBase):
    unit_id: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
