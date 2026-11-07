import uuid
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    full_name: str
    avatar_url: str | None
    is_active: bool
    role: str

    @classmethod
    def of(cls, u) -> "UserOut":
        return cls(id=u.id, email=u.email, full_name=u.full_name, avatar_url=u.avatar_url,
                   is_active=u.is_active, role=u.role.name)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class SessionOut(BaseModel):
    user: UserOut
    csrf_token: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=256)


class UserCreateIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10, max_length=256)
    role: str = "user"


class UserUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=500)


class AdminUserUpdateIn(UserUpdateIn):
    role: str | None = None
    is_active: bool | None = None


class PreferencesIO(BaseModel):
    theme: str = Field(default="dark", pattern="^(dark|light|system)$")
    sidebar_collapsed: bool = False
    dashboard_widgets: dict[str, bool] = {}


# ---- Incidents -------------------------------------------------------------
import datetime as _dt
from typing import Literal

State = Literal["new", "in_progress", "on_hold", "resolved", "closed", "cancelled"]
Level = int  # 1 (high) .. 3 (low); validated below


class UserBrief(BaseModel):
    id: uuid.UUID
    full_name: str
    avatar_url: str | None = None


class CategoryBrief(BaseModel):
    id: uuid.UUID
    name: str


class AssetBrief(BaseModel):
    id: uuid.UUID
    number: str
    name: str


class CategoryNode(CategoryBrief):
    children: list[CategoryBrief] = []


class IncidentCreateIn(BaseModel):
    short_description: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=10000)
    category_id: uuid.UUID | None = None
    subcategory_id: uuid.UUID | None = None
    impact: int = Field(default=3, ge=1, le=3)
    urgency: int = Field(default=3, ge=1, le=3)
    assigned_to_id: uuid.UUID | None = None
    reported_by_id: uuid.UUID | None = None
    location: str = Field(default="", max_length=120)
    asset_id: uuid.UUID | None = None
    due_date: _dt.datetime | None = None


class IncidentUpdateIn(BaseModel):
    short_description: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    category_id: uuid.UUID | None = None
    subcategory_id: uuid.UUID | None = None
    impact: int | None = Field(default=None, ge=1, le=3)
    urgency: int | None = Field(default=None, ge=1, le=3)
    assigned_to_id: uuid.UUID | None = None
    reported_by_id: uuid.UUID | None = None
    location: str | None = Field(default=None, max_length=120)
    asset_id: uuid.UUID | None = None
    due_date: _dt.datetime | None = None


class TransitionIn(BaseModel):
    to: State
    resolution_code: str | None = None
    resolution_notes: str | None = Field(default=None, max_length=10000)
    hold_reason: str | None = Field(default=None, max_length=255)


class CommentIn(BaseModel):
    kind: Literal["comment", "work_note"] = "comment"
    body: str = Field(min_length=1, max_length=10000)


class BulkIn(BaseModel):
    numbers: list[str] = Field(min_length=1, max_length=100)
    action: Literal["assign", "transition"]
    assigned_to_id: uuid.UUID | None = None
    to: State | None = None


class IncidentOut(BaseModel):
    id: uuid.UUID
    number: str
    short_description: str
    description: str
    category: CategoryBrief | None
    subcategory: CategoryBrief | None
    impact: int
    urgency: int
    priority: int
    state: State
    assigned_to: UserBrief | None
    reported_by: UserBrief | None
    location: str
    asset_id: uuid.UUID | None
    asset: AssetBrief | None = None
    due_date: _dt.datetime | None
    hold_reason: str | None
    resolution_code: str | None
    resolution_notes: str | None
    created_at: _dt.datetime
    updated_at: _dt.datetime
    resolved_at: _dt.datetime | None
    closed_at: _dt.datetime | None


class IncidentPage(BaseModel):
    items: list[IncidentOut]
    total: int


class MatrixCell(BaseModel):
    impact: int = Field(ge=1, le=3)
    urgency: int = Field(ge=1, le=3)
    priority: int = Field(ge=1, le=4)
