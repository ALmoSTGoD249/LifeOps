import uuid
from datetime import datetime
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base
from app.models import TimestampMixin, utcnow


class CatalogCategory(Base):
    __tablename__ = "catalog_categories"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(String(255), default="")
    icon: Mapped[str] = mapped_column(String(40), default="package")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class CatalogItem(TimestampMixin, Base):
    __tablename__ = "catalog_items"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("catalog_categories.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(40), default="package")
    estimated_hours: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    approval_required: Mapped[bool] = mapped_column(Boolean, default=False)
    approver_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    default_assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    sequential: Mapped[bool] = mapped_column(Boolean, default=True)  # fulfillment tasks run one after another
    category: Mapped[CatalogCategory] = relationship(lazy="joined")
    fields: Mapped[list["CatalogFormField"]] = relationship(order_by="CatalogFormField.sort_order", cascade="all, delete-orphan", lazy="selectin")
    templates: Mapped[list["CatalogTaskTemplate"]] = relationship(order_by="CatalogTaskTemplate.sort_order", cascade="all, delete-orphan", lazy="selectin")


class CatalogFormField(Base):
    __tablename__ = "catalog_form_fields"
    __table_args__ = (UniqueConstraint("item_id", "key"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("catalog_items.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(40))
    label: Mapped[str] = mapped_column(String(120))
    field_type: Mapped[str] = mapped_column(String(12))  # text textarea number date select checkbox
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    options: Mapped[list] = mapped_column(JSON, default=list)  # select choices (configurable metadata)
    help_text: Mapped[str] = mapped_column(String(255), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class CatalogTaskTemplate(Base):
    """One fulfillment step. Becomes an SCTASK when the requested item enters fulfillment."""
    __tablename__ = "catalog_task_templates"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("catalog_items.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    assignee_mode: Mapped[str] = mapped_column(String(20), default="requester")  # requester | other_member | item_default | user
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    due_offset_days: Mapped[int | None] = mapped_column(Integer)
