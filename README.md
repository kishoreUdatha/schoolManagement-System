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

## AI features

Set `ANTHROPIC_API_KEY` in `backend/.env` to turn them on (model: `CLAUDE_MODEL`,
default `claude-opus-5`). Without a key the app works as before and AI buttons stay
hidden. AI only ever drafts: people review and save through the normal screens.

| Feature | Where | Saves you |
|---|---|---|
| Smart entry (agent) | Teacher → Smart entry | Type "Ravi, Priya absent; maths ex 5.2 due Fri" → attendance + homework drafts with real student ids |
| Student import from photo / PDF / any list | Admin → Students → Bulk import | Reading admission registers and forms into rows |
| Notice drafting | Admin → Notices → New notice | Writing notices from a one-line brief |
| Behaviour ratings from a note | Teacher → Behaviour | Four ratings from one sentence |
| Weekly parent notes | Teacher → Weekly reports | A plain-language summary per student |
| Ask the school (RAG) | Chat button in every portal | Repeat questions to the office. Answers cite the knowledge base, notices and holidays |
| Knowledge base | Admin → AI knowledge base | Where policies/FAQs for the assistant live |
| MCP server | `mcp-server/` | Use the ERP from Claude Desktop or any MCP client |
| n8n workflows | `integrations/n8n/` | Google Form admissions → students; emailed circulars → knowledge base |

Code: `backend/app/ai/` (Claude client, prompts, agent loop, retrieval) and
`backend/app/api/v1/ai.py` (endpoints).

## Project structure

```
backend/      FastAPI app (auth, modules, AI, integrations, workers)
frontend/     Next.js app (parent/teacher/admin portals)
mcp-server/   MCP server exposing the ERP to AI assistants
integrations/ n8n workflow exports
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
