# School Management System

AI-powered school management system with parent/teacher portals, attendance tracking, homework, exams, fees, and multi-channel notifications.

## Stack

- **Backend:** Python 3.11 + FastAPI + SQLAlchemy + Alembic
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database:** PostgreSQL 16 + pgvector
- **Cache/Queue:** Redis + Celery
- **AI:** Claude API (Anthropic)
- **Notifications:** Email (SES), SMS (MSG91), WhatsApp (Twilio), In-app

## Quick start

Prerequisites: Docker Desktop, Node 20+, Python 3.11+ (only needed for local dev outside Docker).

```bash
# 1. Copy env files
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

# 2. Start everything
docker compose up --build

# 3. Open
# Backend docs:  http://localhost:8000/docs
# Frontend:      http://localhost:3000
# Postgres:      localhost:5433  (user: sms, db: sms)  -- 5433 to avoid clash with host PG
```

## Project structure

```
backend/      FastAPI app (auth, modules, AI, integrations, workers)
frontend/     Next.js app (parent/teacher/admin portals)
infra/        docker, nginx, deploy scripts
docs/         architecture, API, deployment notes
```

## Development

See `backend/README.md` and `frontend/README.md` for module-level docs.

## Phase 1 status (10-week MVP)

- [x] Week 1 — Foundation
- [ ] Week 2 — Auth + school setup
- [ ] Week 3 — People management
- [ ] Week 4 — Attendance
- [ ] Week 5 — Homework
- [ ] Week 6 — Exams + report card
- [ ] Week 7 — Fees
- [ ] Week 8 — Notifications
- [ ] Week 9 — AI features
- [ ] Week 10 — Behaviour + YouTube + UAT
