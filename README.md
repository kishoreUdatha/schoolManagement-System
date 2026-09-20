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

## Dev data

A fresh database has nothing in it to click on. Two scripts fill it:

```bash
# tenant + school + the school admin login
docker exec sms-backend python -m scripts.seed_dev_school

# the rest: years, Grade 1 with two sections, subjects, children,
# a parent, staff logins, attendance history and a timetable
docker exec sms-backend python -m scripts.seed_dev_data
```

| Login | Password | Who |
|---|---|---|
| `school@sms.local` | `SchoolPass123!` | school admin |
| `iyer@dev.local` | `TeacherPass123!` | teacher, class teacher of Grade 1 A |
| `sharma@dev.local` | `ParentPass123!` | parent of Aarav Sharma |
| `principal@dev.local` | `PrincipalPass123!` | principal |
| `accountant@dev.local` | `AccountantPass123!` | accountant |
| `admin@sms.local` | `ChangeMe123!` | super admin |

`seed_dev_data` is safe to run again: it looks every record up by name, so
ids stay put and re-running it after the smoke tests puts back anything they
moved.

## Smoke tests

Each module has an end-to-end script that drives the real API. They expect the
dev data above and clean up after themselves, so they can be run in any order
and as often as you like:

```bash
docker exec sms-backend python -m scripts.smoketest_registers

# all of them
for t in backend/scripts/smoketest_*.py; do \
  docker exec sms-backend python -m scripts.$(basename "$t" .py); \
done
```

They find their fixtures through `scripts/devdata.py` (by name, never by id),
so they work against any seeded database.

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
