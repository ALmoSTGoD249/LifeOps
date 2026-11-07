import datetime as dt
import uuid
from typing import Literal
from pydantic import BaseModel, Field
from app.schemas import UserBrief
from app.services.recurrence import FREQUENCIES

TState = Literal["open", "in_progress", "blocked", "completed", "cancelled"]
Freq = Literal["daily", "weekly", "monthly", "quarterly", "yearly"]
assert set(FREQUENCIES) == {"daily", "weekly", "monthly", "quarterly", "yearly"}


class TaskCreateIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=10000)
    category: str = Field(default="", max_length=60)
    priority: int = Field(default=3, ge=1, le=4)
    assigned_to_id: uuid.UUID | None = None
    due_date: dt.datetime | None = None
    incident_number: str | None = Field(default=None, max_length=20)
    recurrence_frequency: Freq | None = None
    recurrence_interval: int = Field(default=1, ge=1, le=60)
    checklist: list[str] = Field(default=[], max_length=50)


class TaskUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    category: str | None = Field(default=None, max_length=60)
    priority: int | None = Field(default=None, ge=1, le=4)
    assigned_to_id: uuid.UUID | None = None
    due_date: dt.datetime | None = None
    incident_number: str | None = Field(default=None, max_length=20)
    recurrence_frequency: Freq | None = None
    recurrence_interval: int | None = Field(default=None, ge=1, le=60)


class TaskTransitionIn(BaseModel):
    to: TState
    blocked_reason: str | None = Field(default=None, max_length=255)


class ChecklistIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class ChecklistPatch(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=200)
    done: bool | None = None


class DependencyIn(BaseModel):
    depends_on: str = Field(max_length=20)  # task number


class TaskCommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
