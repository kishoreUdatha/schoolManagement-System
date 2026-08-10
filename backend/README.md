# Backend — School Management System

FastAPI + SQLAlchemy + Alembic + Celery.

## Local dev (without Docker)

```bash
python -m venv .venv
.venv\Scripts\activate         # Windows
# source .venv/bin/activate    # macOS/Linux

pip install -r requirements.txt
cp .env.example .env

# Start postgres+redis via docker
docker compose -f ../docker-compose.yml up -d postgres redis

# Run migrations (once models exist)
alembic upgrade head

# Run
uvicorn app.main:app --reload
```

Docs at http://localhost:8000/docs

## Creating a migration

```bash
alembic revision --autogenerate -m "add users table"
alembic upgrade head
```

## Layout

```
app/
  api/v1/      Route handlers (thin)
  core/        Security, permissions, audit
  models/      SQLAlchemy ORM
  schemas/     Pydantic request/response
  services/    Business logic
  ai/          Claude integration
  integrations/ Email/SMS/WhatsApp/Storage/Payments
  workers/     Celery tasks
```
