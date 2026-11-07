import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base
from app.models import TimestampMixin, User, utcnow
from app.models_incidents import Incident
from app.models_maintenance import MaintenanceSchedule


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_state_due", "state", "due_date"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), default="")
    priority: Mapped[int] = mapped_column(Integer, default=3)  # 1 critical .. 4 low
    state: Mapped[str] = mapped_column(String(20), default="open", index=True)
    blocked_reason: Mapped[str | None] = mapped_column(String(255))
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Origin. Typed FKs keep referential integrity; Phase 2/3 add ritm_id / maintenance_schedule_id the same way.
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual | incident | request | maintenance
    incident_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("incidents.id", ondelete="SET NULL"), index=True)
    maintenance_schedule_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("maintenance_schedules.id", ondelete="SET NULL", name="fk_tasks_maintenance_schedule_id_maintenance_schedules"), index=True)
    recurrence_frequency: Mapped[str | None] = mapped_column(String(12))
    recurrence_interval: Mapped[int] = mapped_column(Integer, default=1)
    recurrence_spawned: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="joined")
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id], lazy="joined")
    incident: Mapped[Incident | None] = relationship(foreign_keys=[incident_id], lazy="select")
    maintenance_schedule: Mapped["MaintenanceSchedule | None"] = relationship(foreign_keys=[maintenance_schedule_id], lazy="select")


class TaskChecklistItem(Base):
    __tablename__ = "task_checklists"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(200))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class TaskDependency(Base):
    """task_id cannot start/complete until depends_on_id is completed (or cancelled)."""
    __tablename__ = "task_dependencies"
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    depends_on_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True, index=True)


class TaskComment(Base):
    __tablename__ = "task_comments"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
