# Frontend — School Management System

Next.js 14 (App Router) + TypeScript + Tailwind CSS.

## Local dev

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000

## Layout

```
src/
  app/
    (parent)/    Parent portal route group
    (teacher)/   Teacher portal route group
    (admin)/     Admin route group
    login/       Auth
    page.tsx     Landing
  components/    Shared UI
  lib/           api client, auth helpers, types
  hooks/         React hooks
```
