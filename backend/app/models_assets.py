import uuid
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Date, ForeignKey, Index, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base
from app.models import TimestampMixin, User


class AssetCategory(Base):
    __tablename__ = "asset_categories"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Asset(TimestampMixin, Base):
    __tablename__ = "assets"
    __table_args__ = (Index("ix_assets_status", "status"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # AST000001
    name: Mapped[str] = mapped_column(String(120))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("asset_categories.id", ondelete="SET NULL"), index=True)
    manufacturer: Mapped[str] = mapped_column(String(80), default="")
    model: Mapped[str] = mapped_column(String(80), default="")
    serial_number: Mapped[str] = mapped_column(String(80), default="")
    purchase_date: Mapped[date | None] = mapped_column(Date)
    warranty_expires: Mapped[date | None] = mapped_column(Date)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    location: Mapped[str] = mapped_column(String(120), default="")
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)  # null = shared by the household
    condition: Mapped[str] = mapped_column(String(12), default="good")  # new good fair poor
    status: Mapped[str] = mapped_column(String(12), default="in_use")  # in_use in_storage in_repair retired disposed
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    category: Mapped[AssetCategory | None] = relationship(lazy="joined")
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id], lazy="joined")
