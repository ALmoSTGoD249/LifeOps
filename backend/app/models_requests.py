import uuid
from datetime import datetime
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base
from app.models import TimestampMixin, User, utcnow
from app.models_catalog import CatalogItem


class Request(TimestampMixin, Base):
    """REQ: the overall request. State is derived from its RITMs (see services/requests.recompute_request)."""
    __tablename__ = "requests"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    requester_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    state: Mapped[str] = mapped_column(String(20), default="in_progress", index=True)
    short_description: Mapped[str] = mapped_column(String(255))
    justification: Mapped[str] = mapped_column(Text, default="")
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    requester: Mapped[User | None] = relationship(foreign_keys=[requester_id], lazy="joined")
    ritms: Mapped[list["RequestedItem"]] = relationship(back_populates="request", order_by="RequestedItem.number", cascade="all, delete-orphan", lazy="selectin")


class RequestedItem(TimestampMixin, Base):
    """RITM: one catalog item within a REQ."""
    __tablename__ = "requested_items"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("catalog_items.id", ondelete="RESTRICT"), index=True)
    item_name: Mapped[str] = mapped_column(String(120))  # snapshot, survives catalog edits
    state: Mapped[str] = mapped_column(String(24), default="open", index=True)
    form_data: Mapped[dict] = mapped_column(JSON, default=dict)  # answers to the dynamic form
    form_labels: Mapped[list] = mapped_column(JSON, default=list)  # ordered [{key,label}] snapshot, for display (jsonb loses key order)
    sequential: Mapped[bool] = mapped_column(Boolean, default=True)
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="joined")
    request: Mapped[Request] = relationship(back_populates="ritms")
    item: Mapped[CatalogItem] = relationship(lazy="select")
    tasks: Mapped[list["ServiceTask"]] = relationship(order_by="ServiceTask.sort_order", cascade="all, delete-orphan", lazy="selectin")
    approvals: Mapped[list["Approval"]] = relationship(order_by="Approval.created_at", cascade="all, delete-orphan", lazy="selectin")


class ServiceTask(TimestampMixin, Base):
    """SCTASK: a fulfillment step for one RITM."""
    __tablename__ = "service_tasks"
    __table_args__ = (Index("ix_sctask_state_assignee", "state", "assigned_to_id"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    ritm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requested_items.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    state: Mapped[str] = mapped_column(String(20), default="open")  # pending open in_progress completed cancelled
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="joined")


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    ritm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requested_items.id", ondelete="CASCADE"), index=True)
    approver_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    state: Mapped[str] = mapped_column(String(12), default="requested")  # requested approved rejected cancelled
    comment: Mapped[str | None] = mapped_column(Text)
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    approver: Mapped[User | None] = relationship(foreign_keys=[approver_id], lazy="joined")


class RecordComment(Base):
    """Comments for REQ / RITM / SCTASK (and anything else that has no dedicated comment table)."""
    __tablename__ = "record_comments"
    __table_args__ = (Index("ix_record_comments", "record_type", "record_id"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    record_type: Mapped[str] = mapped_column(String(30))
    record_id: Mapped[str] = mapped_column(String(64))
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
