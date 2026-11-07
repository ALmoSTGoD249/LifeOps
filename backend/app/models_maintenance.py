import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base
from app.models import TimestampMixin, User, utcnow
from app.models_assets import Asset


class MaintenanceSchedule(TimestampMixin, Base):
    __tablename__ = "maintenance_schedules"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # MNT000001
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"), index=True)
    frequency: Mapped[str] = mapped_column(String(12))  # daily weekly monthly quarterly yearly
    interval: Mapped[int] = mapped_column(Integer, default=1)
    next_due: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    lead_days: Mapped[int] = mapped_column(Integer, default=3)  # create the task this many days before it is due
    from_completion: Mapped[bool] = mapped_column(Boolean, default=False)  # next due counts from completion, not the old due date
    priority: Mapped[int] = mapped_column(Integer, default=3)
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    asset: Mapped[Asset | None] = relationship(lazy="joined")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="joined")
    checklist: Mapped[list["MaintenanceChecklistItem"]] = relationship(order_by="MaintenanceChecklistItem.sort_order", cascade="all, delete-orphan", lazy="selectin")


class MaintenanceChecklistItem(Base):
    """Template items copied onto every generated task."""
    __tablename__ = "maintenance_checklist_items"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    schedule_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maintenance_schedules.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class MaintenanceRecord(Base):
    """Completion history. One row per finished (or skipped) cycle."""
    __tablename__ = "maintenance_records"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    schedule_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("maintenance_schedules.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"))
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"), index=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    completed_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    outcome: Mapped[str] = mapped_column(String(12), default="completed")  # completed | skipped
    notes: Mapped[str] = mapped_column(String(255), default="")
    completed_by: Mapped[User | None] = relationship(foreign_keys=[completed_by_id], lazy="joined")
