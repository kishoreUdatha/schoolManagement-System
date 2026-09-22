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
- `api.upload(path, formData)` for multipart uploads, `api.download(path, filename)`,
  `api.open(path)` (PDF in a new tab) and `api.blob(path)`, all with token refresh.
  Do not write your own fetch helpers.
- `Dialog` from `@/components/ui/Dialog`: the mock's modal, as a component, with an
  optional form (`onSubmit`) and `actions`.
- `DataTable` (with `onView` or `actions={(i) => …}` for per-row buttons,
  `total/page/pages/onPage`, `empty`),
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

## New screens (no mock)

Some screens exist because the backend supports a feature the 296 mocks
never drew. They are listed in `src/lib/extraScreens.ts` (ids `NEW-…`), so the
shell, sidebar and search already know them. Only the page is missing.

- The page goes at the screen's `route` under `src/app/(screens)/`, with the same
  header as a wired page and the line `// New screen (no mock)`.
- Design it from the mock's vocabulary so it looks like it was always there. Use
  the page head's actions for the main button, `StatStrip` for headline
  figures, a `filterbar` above a `Panel` + `DataTable` for lists, `two-col`
  with a `form` panel and an `aside-panel` for forms, and `Dialog` for a quick add
  or edit. Find the closest existing screen in the same module and follow it.
- Public pages (no sign-in, for example the online admission form) do not use
  `AppShell`. Use the `auth-page` layout of the sign-in screen
  (`src/app/(screens)/welcome/sign-in/page.tsx`).

## The parent app (/parent)

The parent portal follows the approved Parent Mobile pack (58 screens,
PM-001…PM-058), not the staff workspace design. `scripts/build_parent_pages.py`
converted the pack: each screen is `src/app/parent/<slug>/page.tsx` inside
`<ParentShell screen={n}>`, the pack's phone frame with header, child bar, bottom tabs and
More menu. Its styles are `src/styles/parent.css`, which is generated and scoped
under `.pm`, so use the pack's class names (`panel`, `item`, `action`, `status`,
`v-icon`, `identity-card` …) exactly as the converted markup does. The registry is
`src/lib/parentScreens.ts`; `parentRoute(n)` gives a screen's route.

- `useParent()` (from `@/components/parent/ParentShell`) gives `children`, the selected
  `child` / `childId`, `setChild`, `notify` (toast), `go(n)`, `loading` and `error`.
  Every child-scoped request must use `childId`, and pass it in the `useApi` path so
  switching child reloads the data. Never mix siblings' records.
- Parent endpoints are `/api/v1/parent/me/...` (children, fees, homework, leaves,
  notices, conversations, ptm, transport…). Read the OpenAPI spec and the old frontend
  (`frontend/src/app/parent/`) for how they are called.
- Keep the converted markup and fill it with real data. The mock uses `data-go="n"` for
  navigation, which `ParentShell` still honours. Replace it with `go(n)` or `<Link>` where
  you touch an element. `data-act` and similar attributes do nothing: give those
  elements real handlers.
- Pages keep the header comment. When wired, add a line starting `// Wired:` so the
  converter leaves the page alone.
- Payments: server-created order, provider-hosted checkout, and success only once the
  server has verified it (see `features/fees/OnlinePayment.tsx`, which already does this
  for the staff view).
- Parents sign in with email and password; an OTP step follows when the server asks
  (`otp_required`). The dev parent is `sharma@dev.local` / `ParentPass123!` (no OTP).
