import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base
from app.models import TimestampMixin, User, utcnow


class KnowledgeCategory(Base):
    __tablename__ = "knowledge_categories"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class KnowledgeArticle(TimestampMixin, Base):
    __tablename__ = "knowledge_articles"
    __table_args__ = (Index("ix_kb_status", "status"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # KB000001
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")  # Markdown, rendered without raw HTML on the client
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("knowledge_categories.id", ondelete="SET NULL"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="draft")  # draft | published
    admins_only: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    category: Mapped[KnowledgeCategory | None] = relationship(lazy="joined")
    created_by: Mapped[User | None] = relationship(foreign_keys=[created_by_id], lazy="joined")
    updated_by: Mapped[User | None] = relationship(foreign_keys=[updated_by_id], lazy="joined")
    tags: Mapped[list["ArticleTag"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    secrets: Mapped[list["ArticleSecret"]] = relationship(order_by="ArticleSecret.sort_order", cascade="all, delete-orphan", lazy="selectin")


class ArticleTag(Base):
    __tablename__ = "article_tags"
    article_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_articles.id", ondelete="CASCADE"), primary_key=True)
    tag: Mapped[str] = mapped_column(String(40), primary_key=True)


class ArticleSecret(Base):
    """A labelled secret (Wi-Fi password, alarm code). Value is encrypted at rest and never returned in lists."""
    __tablename__ = "article_secrets"
    __table_args__ = (UniqueConstraint("article_id", "label"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    article_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_articles.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(80))
    value_encrypted: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
