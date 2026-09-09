from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SupplierBase(BaseModel):
    company_name: str = Field(min_length=1, max_length=150)
    contact_person: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    address: str | None = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=150)
    contact_person: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    address: str | None = None


class SupplierRead(SupplierBase):
    supplier_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
