# Wiring a screen to the backend

Every screen in `web/` started as the mock's markup with sample data. Wiring
a screen replaces the sample data with the live FastAPI backend and keeps the
look exactly as it is. The worked examples are in `src/features/students/`:

| Kind | Example | Screen |
|---|---|---|
| List with filters and paging | `StudentDirectory.tsx` | SCR-055 |
| Create / edit form | `StudentForm.tsx` | SCR-056, SCR-058 |
| Record page (`?id=`) with tabs | `StudentProfile.tsx` | SCR-057 |

Read all three before starting.

## The shape of a wired page

```tsx
// SCR-057 · Student Profile Overview
// Module: … · Role: … · Release: …
// Mock: screens/SCR-057_Student_Profile_Overview.html
// Wired: GET /api/v1/school/students/{id} (?id=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StudentProfile } from "@/features/students/StudentProfile";

export const metadata = { title: "SCR-057 · Student Profile Overview · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-057" actions={/* the page-head buttons */}>
      <Suspense>
        <StudentProfile />
      </Suspense>
    </AppShell>
  );
}
```

- **Mark the page as wired.** The header line starting `// Wired:` tells
  `scripts/build_pages.py` never to regenerate the page, and tells
  `verify_pages.py` to skip it. Use it to list the endpoints the page uses.
- **Keep the page itself a server component.** Put the live UI in a
  `"use client"` component under `src/features/<module>/`. Wrap it in
  `<Suspense>`, because anything that reads `useSearchParams` needs one.
- **Keep the mock's markup.** Start from the generated page's JSX and keep
  its classes and layout (`panel`, `two-col`, `stack`, `kv`, `form-grid`,
  `field`, `stat-strip`, `filterbar`, `timeline-item` …). Replace sample
  values with API values, and keep labels, order and structure. A wired
  screen should look like its mock filled with real data.
- **Replace the preview hooks.** Remove `data-*` hooks (`data-action`,
  `data-submit-main`, `data-view-row`, `id="main-form"`, `data-table-search`,
  `data-filter-col` …) from anything you wire, and give it real React
  handlers. Those hooks drive `PreviewInteractions`, which only fakes
  behaviour.

## Tools you have

- `api.get/post/patch/put/delete` from `@/lib/api`: bearer token, refresh,
  and a readable `Error` message on failure.
- `useApi<T>(path | null, params)` from `@/lib/useApi` returns
  `{ data, error, loading, reload }`. Pass `null` for the path until its
  inputs are ready.
- `Paginated<T>` from `@/lib/api` for `{ items, total, page, pages }`.
- `useSession()` from `@/lib/useSession`: the signed-in user
  (`user.role`, `user.school_id` …).
- `date`, `dateTime`, `money`, `pct`, `label`, `initials` from
  `@/lib/format`.
- `notify(msg)` from `@/lib/notify` shows a toast after a save.
- `ErrorNote`, `Loading`, `PickFirst` from `@/components/ui/states`.
- `DataTable` (with `onView`, `total/page/pages/onPage`, `empty`),
  `StatStrip`, `Panel`, `Badge`, `Person`, `Avatar`, `Chart`, `Icon`.
- `routeOf(n)` from `@/lib/screens` gives screen number to route. Pass
  records between screens with `?id=`.

## Finding the API

1. Each generated page's header says where the **old** frontend implemented
   the screen: `// Backend: the old frontend served this at /school/…`. Read
   that page under `frontend/src/app/…` to see which endpoints it calls and
   with which parameters. It is the most reliable guide.
2. `curl -s localhost:8000/openapi.json` lists all 774 endpoints with request
   and response schemas.
3. Portals: `/api/v1/school/*` (school admin), `/teacher/*`, `/parent/*`,
   `/student/*`, `/principal/*`, `/accountant/*`, `/staff/*`,
   `/super-admin/*`. A screen built for one role (Parent Dashboard, the
   Teacher screens…) uses that role's portal.

## Rules

- **Stay in your lane.** Edit only the pages of the modules you were given
  and your own `src/features/<module>/` folders. Do not edit `src/lib/`,
  `src/components/`, `src/styles/`, `scripts/` or other modules' pages. If
  you need a helper, write it in your features folder. If you think a shared
  file must change, say so in your report instead of changing it.
- **Do not change the backend.** Do not invent endpoints or parameters.
  Where the mock shows something the API does not provide, keep the rest of
  the screen live. Either leave that element as the mock had it, with a
  `// Not wired: <what> — no endpoint` comment beside it, or drop it if
  leaving it would show false numbers. Never show sample numbers as though
  they were real.
- **No writes against the dev database.** Check GETs with curl. For
  POST/PATCH/DELETE, match the request body to the OpenAPI schema and the
  old frontend's call; the reviewer tests writes.
- **No browser.** Verify with the type checker, the build and curl.

## Checking your work

```bash
cd web
npm install              # once per worktree
npx tsc --noEmit         # must be clean
npm run build            # must pass
```

To see real responses, get a dev token and call the backend directly:

```bash
TOKEN=$(curl -s -X POST localhost:8000/api/v1/school/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"school@sms.local","password":"SchoolPass123!"}' | python -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
curl -s "localhost:8000/api/v1/school/students?page_size=2" -H "Authorization: Bearer $TOKEN"
```

Dev logins (from the repo README):

| Login | Password | Portal |
|---|---|---|
| `school@sms.local` | `SchoolPass123!` | school |
| `iyer@dev.local` | `TeacherPass123!` | teacher |
| `sharma@dev.local` | `ParentPass123!` | parent (may need an OTP) |
| `principal@dev.local` | `PrincipalPass123!` | principal |
| `accountant@dev.local` | `AccountantPass123!` | accountant |
| `admin@sms.local` | `ChangeMe123!` | super-admin |
