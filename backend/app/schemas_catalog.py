import datetime as dt
import uuid
from typing import Literal
from pydantic import BaseModel, Field, model_validator

FieldType = Literal["text", "textarea", "number", "date", "select", "checkbox"]
AssigneeMode = Literal["requester", "other_member", "item_default", "user"]


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=255)
    icon: str = Field(default="package", max_length=40)
    sort_order: int = Field(default=0, ge=0, le=1000)


class FieldIn(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    label: str = Field(min_length=1, max_length=120)
    field_type: FieldType
    required: bool = False
    options: list[str] = Field(default=[], max_length=50)
    help_text: str = Field(default="", max_length=255)

    @model_validator(mode="after")
    def _select_needs_options(self):
        self.options = [o.strip() for o in self.options if o.strip()]
        if self.field_type == "select" and not self.options:
            raise ValueError(f"Field '{self.key}' is a dropdown and needs at least one option")
        if any(len(o) > 100 for o in self.options):
            raise ValueError("Options must be 100 characters or fewer")
        return self


class TemplateIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)
    assignee_mode: AssigneeMode = "requester"
    assignee_id: uuid.UUID | None = None
    due_offset_days: int | None = Field(default=None, ge=0, le=365)

    @model_validator(mode="after")
    def _user_mode(self):
        if self.assignee_mode == "user" and not self.assignee_id:
            raise ValueError("Choose a person for tasks assigned to a specific user")
        return self


class ItemIn(BaseModel):
    category_id: uuid.UUID
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    icon: str = Field(default="package", max_length=40)
    estimated_hours: int | None = Field(default=None, ge=1, le=8760)
    is_active: bool = True
    approval_required: bool = False
    approver_id: uuid.UUID | None = None
    default_assignee_id: uuid.UUID | None = None
    sequential: bool = True
    fields: list[FieldIn] = Field(default=[], max_length=40)
    tasks: list[TemplateIn] = Field(default=[], max_length=30)

    @model_validator(mode="after")
    def _unique_keys(self):
        keys = [f.key for f in self.fields]
        if len(keys) != len(set(keys)):
            raise ValueError("Form field keys must be unique")
        return self


class RequestEntry(BaseModel):
    item_id: uuid.UUID
    form_data: dict = Field(default={})


class RequestIn(BaseModel):
    items: list[RequestEntry] = Field(min_length=1, max_length=10)
    justification: str = Field(default="", max_length=5000)


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    comment: str | None = Field(default=None, max_length=2000)


class ConfirmIn(BaseModel):
    accepted: bool
    comment: str | None = Field(default=None, max_length=2000)


class SCTransitionIn(BaseModel):
    to: Literal["open", "in_progress", "completed", "cancelled"]


class SCPatchIn(BaseModel):
    assigned_to_id: uuid.UUID | None = None
    due_date: dt.datetime | None = None


class RitmPatchIn(BaseModel):
    assigned_to_id: uuid.UUID | None = None


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
