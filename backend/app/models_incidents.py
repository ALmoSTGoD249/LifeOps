import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base
from app.models import TimestampMixin, User, utcnow
from app.models_assets import Asset


class IncidentCategory(Base):
    __tablename__ = "incident_categories"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("incident_categories.id", ondelete="CASCADE"), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class PriorityMatrix(Base):
    """Admin-editable impact x urgency -> priority lookup. 1 = highest for all three."""
    __tablename__ = "priority_matrix"
    impact: Mapped[int] = mapped_column(Integer, primary_key=True)
    urgency: Mapped[int] = mapped_column(Integer, primary_key=True)
    priority: Mapped[int] = mapped_column(Integer)


class Incident(TimestampMixin, Base):
    __tablename__ = "incidents"
    __table_args__ = (Index("ix_incidents_state_priority", "state", "priority"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    short_description: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("incident_categories.id", ondelete="SET NULL"))
    subcategory_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("incident_categories.id", ondelete="SET NULL"))
    impact: Mapped[int] = mapped_column(Integer, default=3)
    urgency: Mapped[int] = mapped_column(Integer, default=3)
    priority: Mapped[int] = mapped_column(Integer, default=4)
    state: Mapped[str] = mapped_column(String(20), default="new", index=True)
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    reported_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    location: Mapped[str] = mapped_column(String(120), default="")
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL", name="fk_incidents_asset_id_assets"), index=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hold_reason: Mapped[str | None] = mapped_column(String(255))
    resolution_code: Mapped[str | None] = mapped_column(String(40))
    resolution_notes: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    category: Mapped[IncidentCategory | None] = relationship(foreign_keys=[category_id], lazy="joined")
    subcategory: Mapped[IncidentCategory | None] = relationship(foreign_keys=[subcategory_id], lazy="joined")
    asset: Mapped["Asset | None"] = relationship(foreign_keys=[asset_id], lazy="joined")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="joined")
    reported_by: Mapped[User | None] = relationship(foreign_keys=[reported_by_id], lazy="joined")


class IncidentComment(Base):
    __tablename__ = "incident_comments"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(12), default="comment")  # comment | work_note
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Attachment(Base):
    """Generic: reused by tasks, requests, assets and articles in later phases."""
    __tablename__ = "attachments"
    __table_args__ = (Index("ix_attachments_record", "record_type", "record_id"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    record_type: Mapped[str] = mapped_column(String(30))
    record_id: Mapped[str] = mapped_column(String(64))
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(64), unique=True)
    mime: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
