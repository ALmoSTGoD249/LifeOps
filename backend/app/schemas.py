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
