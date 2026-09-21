# BrightCampus web

The 296 School ERP screens, built from the BrightCampus mock pack so they
match the mocks exactly. Every page currently shows sample data. Each one gets
wired to the backend separately.

```bash
npm install
npm run dev          # http://localhost:3100  (catalogue at /screens)
```

## How the pages are made

`scripts/build_pages.py` reads the mock pack's `screens/*.html` and writes one
Next.js page per screen under `src/app/(screens)/<module>/<screen>/page.tsx`
(SCR-001 is `/`). The mock pack lives outside git, in
`Mock Screen/School_ERP_296_Editable_Source/BrightCampus_296_Editable_Source`.

- The mock's shared pieces become components: `AppShell` (sidebar, top bar,
  breadcrumb, page head), `Panel`, `DataTable`, `StatStrip`, `Chart`, `Icon`.
  The converter only swaps in a component when the designers' own generator
  reproduces the original markup from that component's arguments.
- The sample data for tables and stat strips is pulled into constants at the
  top of each page (`rows`, `columns`, `stats`). **Swap those constants for API
  data to wire a page.**
- Each page's header comment names the old `frontend/` route that talked to
  the backend for that screen, so you know where to find its API calls.
- `src/styles/styles.css` is the mocks' stylesheet with the type adapted:
  Inter instead of Manrope, 9–14px text raised to 11–15px, weights eased one
  step. `src/styles/app.css` holds everything else we changed on top of the
  mocks (bright palette, white page, school card in the top bar).
- `PreviewInteractions` is the mock's `app.js`, ported. It drives table
  search and filters, form validation, attendance and marks totals, and
  similar behaviour through `data-*` attributes. Once a page is wired, give its
  controls real handlers.

`python scripts/verify_pages.py` (run after `npm run build`) compares every
built page with its mock, markup for markup. It currently reports 296 of 296
matching.

**Before you hand-edit a generated page**, add its SCR id to `KEEP` in
`build_pages.py`. Otherwise the next regeneration overwrites your changes.
