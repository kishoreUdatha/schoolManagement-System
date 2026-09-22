from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.debug,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception as exc:
        # A write a signed-in user attempted and the server refused goes on
        # the audit trail as a failed attempt (see app.core.audit).
        from app.core.audit import record_refused_write

        record_refused_write(db, exc)
        raise
    finally:
        db.close()
