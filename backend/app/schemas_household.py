import datetime as dt
import uuid
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from app.schemas_tasks import Freq


class AssetIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category_id: uuid.UUID | None = None
    manufacturer: str = Field(default="", max_length=80)
    model: str = Field(default="", max_length=80)
    serial_number: str = Field(default="", max_length=80)
    purchase_date: dt.date | None = None
    warranty_expires: dt.date | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0, le=Decimal("100000000"), decimal_places=2)
    location: str = Field(default="", max_length=120)
    owner_id: uuid.UUID | None = None
    condition: Literal["new", "good", "fair", "poor"] = "good"
    status: Literal["in_use", "in_storage", "in_repair", "retired", "disposed"] = "in_use"
    notes: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def _dates(self):
        if self.purchase_date and self.warranty_expires and self.warranty_expires < self.purchase_date:
            raise ValueError("Warranty cannot expire before the purchase date")
        return self


class AssetPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    category_id: uuid.UUID | None = None
    manufacturer: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=80)
    serial_number: str | None = Field(default=None, max_length=80)
    purchase_date: dt.date | None = None
    warranty_expires: dt.date | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0, le=Decimal("100000000"), decimal_places=2)
    location: str | None = Field(default=None, max_length=120)
    owner_id: uuid.UUID | None = None
    condition: Literal["new", "good", "fair", "poor"] | None = None
    status: Literal["in_use", "in_storage", "in_repair", "retired", "disposed"] | None = None
    notes: str | None = Field(default=None, max_length=10000)


class ScheduleIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=5000)
    asset_number: str | None = Field(default=None, max_length=20)
    frequency: Freq
    interval: int = Field(default=1, ge=1, le=60)
    first_due: dt.datetime
    lead_days: int = Field(default=3, ge=0, le=90)
    from_completion: bool = False
    priority: int = Field(default=3, ge=1, le=4)
    assigned_to_id: uuid.UUID | None = None
    is_active: bool = True
    checklist: list[str] = Field(default=[], max_length=50)


class SchedulePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    asset_number: str | None = Field(default=None, max_length=20)
    frequency: Freq | None = None
    interval: int | None = Field(default=None, ge=1, le=60)
    next_due: dt.datetime | None = None
    lead_days: int | None = Field(default=None, ge=0, le=90)
    from_completion: bool | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    assigned_to_id: uuid.UUID | None = None
    is_active: bool | None = None
    checklist: list[str] | None = Field(default=None, max_length=50)


class SecretIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=2000)


class ArticleIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    body: str = Field(default="", max_length=100000)
    category_id: uuid.UUID | None = None
    status: Literal["draft", "published"] = "draft"
    admins_only: bool = False
    tags: list[str] = Field(default=[], max_length=20)
    secrets: list[SecretIn] | None = None  # None on update = leave secrets untouched


class ArticlePatch(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    body: str | None = Field(default=None, max_length=100000)
    category_id: uuid.UUID | None = None
    status: Literal["draft", "published"] | None = None
    admins_only: bool | None = None
    tags: list[str] | None = Field(default=None, max_length=20)


class SecretPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    value: str | None = Field(default=None, min_length=1, max_length=2000)
