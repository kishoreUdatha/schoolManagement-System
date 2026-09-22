"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { PublicLink } from "@/features/admissions/types";
import { careersPath } from "@/features/public/links";
import type { Department, Opening, OpeningStatus } from "./types";
import { Dialog, Field, KV, useNewFlag } from "./ui";

import { ask } from "@/lib/dialog";
const BASE = "/api/v1/school/hr/openings";
const STATUSES: OpeningStatus[] = ["draft", "open", "on_hold", "closed", "filled"];
const TYPES = ["full_time", "part_time", "contract", "temporary"];
const SHOWN: Record<OpeningStatus, string> = { draft: "Draft", open: "Published", on_hold: "On hold", closed: "Closed", filled: "Filled" };

/** The body PUT /openings/{id} expects, from an opening as read. */
function asInput(o: Opening, patch: Partial<Opening> = {}) {
  const x = { ...o, ...patch };
  return {
    title: x.title,
    department_id: x.department_id,
    employment_type: x.employment_type,
    vacancies: x.vacancies,
    description: x.description,
    requirements: x.requirements,
    salary_min: x.salary_min,
    salary_max: x.salary_max,
    is_public: x.is_public,
    closes_on: x.closes_on,
  };
}

/**
 * SCR-173, live: GET/POST /api/v1/school/hr/openings, GET/PUT/DELETE /{id}
 * (the detail dialog, also opened by ?id=), POST /{id}/status. The careers
 * link uses GET /admissions/public-link for the school's codes.
 */
export function JobOpenings() {
  const [status, setStatus] = useState("");
  const [deptId, setDeptId] = useState("");
  const [typed, setTyped] = useState("");
  const list = useApi<Opening[]>(BASE, { status });
  const depts = useApi<Department[]>("/api/v1/school/departments");
  const [creating, closeCreate] = useNewFlag();
  // The opening shown in the dialog: ?id= from a link, or a row's View. Its
  // record comes fresh from GET /openings/{id}; the row fills in meanwhile.
  const idParam = useSearchParams().get("id");
  const [openId, setOpenId] = useState<number | null>(idParam ? Number(idParam) : null);
  const detail = useApi<Opening>(openId ? `${BASE}/${openId}` : null);
  const open = openId ? (detail.data?.id === openId ? detail.data : (list.data?.find((o) => o.id === openId) ?? null)) : null;
  const setOpen = (o: Opening | null) => setOpenId(o?.id ?? null);
  const link = useApi<PublicLink>("/api/v1/school/admissions/public-link");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (list.data ?? []).filter(
      (o) => (!deptId || String(o.department_id) === deptId) && (!q || [o.title, o.reference_no, o.department_name].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [list.data, deptId, typed]);

  // Counts follow the status chosen (the server filters by it), not the search.
  const all = list.data ?? [];
  const live = all.filter((o) => o.status === "open");
  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Openings", value: n(all.length), note: `${all.filter((o) => o.status === "draft").length} still in draft` },
    { label: "Published", value: n(live.length), note: `${live.filter((o) => o.is_public).length} on the careers page` },
    { label: "Seats to fill", value: n(live.reduce((t, o) => t + Math.max(0, o.vacancies - o.hired), 0)), note: "Across published openings" },
    { label: "Applications", value: n(all.reduce((t, o) => t + o.applications, 0)), note: `${all.reduce((t, o) => t + o.hired, 0)} hired so far` },
  ];

  const rows: Row[] = items.map((o) => [
    { name: o.title, sub: `${o.reference_no} · ${label(o.employment_type)}` },
    o.department_name ?? "—",
    `${o.hired}/${o.vacancies}`,
    String(o.applications),
    date(o.closes_on),
    SHOWN[o.status],
  ]);

  async function act(fn: () => Promise<Opening | unknown>, done: string) {
    setError(null);
    setBusy(true);
    try {
      const r = await fn();
      notify(done);
      list.reload();
      detail.reload();
      return r;
    } catch (e) {
      setError(errorText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const r = await act(
      () =>
        api.post(BASE, {
          title: text("title"),
          department_id: text("department_id") ? Number(text("department_id")) : null,
          employment_type: text("employment_type") || "full_time",
          vacancies: Number(text("vacancies")) || 1,
          description: text("description") || null,
          requirements: text("requirements") || null,
          salary_min: text("salary_min") || null,
          salary_max: text("salary_max") || null,
          closes_on: text("closes_on") || null,
          is_public: f.get("is_public") === "on",
        }),
      "Opening created as a draft. Publish it to take applications.",
    );
    if (r) closeCreate();
  }

  const setState = async (o: Opening, value: OpeningStatus, done: string) => {
    const r = (await act(() => api.post<Opening>(`${BASE}/${o.id}/status`, undefined, { value }), done)) as Opening | undefined;
    if (r) setOpen(r);
  };

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search job openings…" aria-label="Search job openings" />
        </div>
        <select aria-label="Filter by department" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
          <option value="">All departments</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {SHOWN[s]}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <Panel title="All openings" sub={`Posts being recruited for${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Job title", "Department", "Vacancies", "Applications", "Closing date", "Status"]}
          rows={rows}
          onView={(i) => setOpen(items[i])}
          empty={list.loading ? "Loading openings…" : typed || deptId || status ? "No opening matches these filters." : "No openings yet."}
        />
      </Panel>

      {creating ? (
        <Dialog title="Create opening" onClose={closeCreate} onSubmit={create} submit="Save draft" busy={busy} error={error} wide>
          <div className="form-grid">
            <Field label="Job title" required>
              <input name="title" required minLength={2} maxLength={160} placeholder="Mathematics Teacher" />
            </Field>
            <Field label="Department">
              <select name="department_id" defaultValue="">
                <option value="">None</option>
                {depts.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Employment type">
              <select name="employment_type" defaultValue="full_time">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vacancies" required>
              <input name="vacancies" type="number" min={1} max={500} defaultValue={1} required />
            </Field>
            <Field label="Salary from (₹ a year)">
              <input name="salary_min" type="number" min={0} max={100000000} />
            </Field>
            <Field label="Salary to (₹ a year)">
              <input name="salary_max" type="number" min={0} max={100000000} />
            </Field>
            <Field label="Closing date">
              <input name="closes_on" type="date" />
            </Field>
            <label className="field">
              <span>Careers page</span>
              <span className="row">
                <input type="checkbox" name="is_public" defaultChecked /> Show on the public careers page once published
              </span>
            </label>
            <Field label="About the role" full>
              <textarea name="description" rows={3} maxLength={10000} />
            </Field>
            <Field label="What we are looking for" full>
              <textarea name="requirements" rows={3} maxLength={10000} />
            </Field>
          </div>
        </Dialog>
      ) : null}

      {open ? (
        <Dialog title={open.title} onClose={() => setOpen(null)} error={error} wide>
          <div className="row" style={{ marginBottom: 12 }}>
            <Badge>{SHOWN[open.status]}</Badge>
            <span className="muted small">{open.reference_no}</span>
          </div>
          <KV
            rows={[
              ["Department", open.department_name ?? "—"],
              ["Employment type", label(open.employment_type)],
              ["Vacancies", `${open.hired} of ${open.vacancies} filled`],
              ["Applications", String(open.applications)],
              ["Salary", open.salary_min ? `${money(open.salary_min)}${open.salary_max ? ` – ${money(open.salary_max)}` : ""} a year` : "—"],
              ["Posted", date(open.posted_on)],
              ["Closes", date(open.closes_on)],
              ["Careers page", open.is_public ? (open.status === "open" ? "Shown now" : "Shown once published") : "Not shown"],
            ]}
          />
          {detail.error && detail.data?.id !== openId ? <p className="small muted">{`Showing the list's copy: ${detail.error}`}</p> : null}
          {open.is_public && open.status === "open" && link.data ? (
            <p className="small">
              <a href={careersPath(link.data.tenant_code, link.data.code)} target="_blank" rel="noreferrer">
                Open the public careers page
              </a>
            </p>
          ) : null}
          {open.description ? <p>{open.description}</p> : null}
          {open.requirements ? <p>{open.requirements}</p> : null}
          <div className="row" style={{ flexWrap: "wrap", marginTop: 14, gap: 8 }}>
            {open.status === "draft" || open.status === "on_hold" ? (
              <button type="button" className="btn primary" disabled={busy} onClick={() => setState(open, "open", "Opening published.")}>
                Publish
              </button>
            ) : null}
            {open.status === "open" ? (
              <>
                <button type="button" className="btn" disabled={busy} onClick={() => setState(open, "on_hold", "Opening put on hold.")}>
                  Put on hold
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setState(open, "closed", "Opening closed.")}>
                  Close
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                const r = (await act(() => api.put<Opening>(`${BASE}/${open.id}`, asInput(open, { is_public: !open.is_public })), "Careers page setting saved.")) as Opening | undefined;
                if (r) setOpen(r);
              }}
            >
              {open.is_public ? "Hide from careers page" : "Show on careers page"}
            </button>
            {open.applications > 0 ? (
              <Link className="btn" href={`${routeOf(174)}?opening=${open.id}`}>
                See applications
              </Link>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={async () => {
                  if (!(await ask(`Delete ${open.title}?`))) return;
                  if ((await act(() => api.delete(`${BASE}/${open.id}`), "Opening deleted.")) !== undefined) setOpen(null);
                }}
              >
                Delete
              </button>
            )}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
