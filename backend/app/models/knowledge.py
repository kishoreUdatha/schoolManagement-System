from typing import Optional

from sqlalchemy import BigInteger, Computed, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class KnowledgeDocument(Base, PrimaryKeyMixin, TimestampMixin):
    """A school document the AI assistant can answer from (policies, FAQs,
    fee rules, timings...). Split into KnowledgeChunk rows for retrieval."""

    __tablename__ = "knowledge_documents"
    __table_args__ = (Index("ix_knowledge_documents_school_id", "school_id"),)

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # 'all' = parents + staff, 'staff' = staff only
    audience: Mapped[str] = mapped_column(String(20), nullable=False, default="all")
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class KnowledgeChunk(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        Index("ix_knowledge_chunks_document_id", "document_id"),
        Index("ix_knowledge_chunks_school_id", "school_id"),
        Index("ix_knowledge_chunks_search", "search", postgresql_using="gin"),
    )

    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    document_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    search: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('english', content)", persisted=True)
    )
