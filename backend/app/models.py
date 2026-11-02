"""Phase 1 models. Later phases add incidents, requests, tasks, etc. as separate modules
imported here so Alembic sees them."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (JSON, Boolean, DateTime, ForeignKey, Index, Integer, String,
                        Text, UniqueConstraint, Uuid)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    description: Mapped[str] = mapped_column(String(255), default="")


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id"))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    role: Mapped[Role] = relationship(lazy="joined")


class Household(TimestampMixin, Base):
    __tablename__ = "households"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))


class HouseholdMember(Base):
    __tablename__ = "household_members"
    __table_args__ = (UniqueConstraint("household_id", "user_id"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserPreference(Base):
    __tablename__ = "user_preferences"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    theme: Mapped[str] = mapped_column(String(20), default="dark")
    sidebar_collapsed: Mapped[bool] = mapped_column(Boolean, default=False)
    dashboard_widgets: Mapped[dict] = mapped_column(JSON, default=dict)  # widget visibility only


class AuthSession(Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)  # sha256 of cookie token
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship(lazy="joined")


class RecordSequence(Base):
    """Human-readable numbers (INC000001, REQ000001, ...). Row-locked on increment."""
    __tablename__ = "record_sequences"
    prefix: Mapped[str] = mapped_column(String(10), primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, default=0)


class ActivityLog(Base):
    """Append-only audit trail. Never reconstructed from updated_at."""
    __tablename__ = "activity_logs"
    __table_args__ = (Index("ix_activity_record", "record_type", "record_id"),
                      Index("ix_activity_created", "created_at"))
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(50))
    record_type: Mapped[str] = mapped_column(String(30))
    record_id: Mapped[str] = mapped_column(String(64))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
