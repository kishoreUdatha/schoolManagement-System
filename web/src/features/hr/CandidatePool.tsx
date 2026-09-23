"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { Candidate, CandidateSource, Opening, Pipeline, Stage } from "./types";
import { Field, NewLink, today, useNewFlag } from "./ui";

const BASE = "/api/v1/school/hr";
const SOURCES: CandidateSource[] = ["website", "referral", "agency", "walk_in", "job_portal", "other"];
const STAGES: Stage[] = ["applied", "screening", "shortlisted", "interview", "offered", "hired", "rejected", "withdrawn"];

const years = (v: string | null) => (v === null || v === "" ? "—" : `${Number(v)} yr${Number(v) === 1 ? "" : "s"}`);

/** Everything POST /hr/candidates takes, from a form (email is the key it matches on). */
function candidateBody(f: FormData, keep?: Candidate) {
  const text = (k: string) => String(f.get(k) ?? "").trim() || null;
  return {
    full_name: text("full_name"),
    email: keep?.email ?? text("email"),
    phone: text("phone"),
    source: text("source") ?? "website",
    qualification: text("qualification"),
    experience_years: text("experience_years"),
    current_employer: text("current_employer"),
    notes: text("notes"),
  };
}

/** A candidate as POST /hr/applications' `candidate`, unchanged. */
const asCandidateIn = (c: Candidate) => ({
  full_name: c.full_name,
  email: c.email,
  phone: c.phone,
  source: c.source,
  qualification: c.qualification,
  experience_years: c.experience_years,
  current_employer: c.current_employer,
  notes: c.notes,
});

/**
 * NEW-060, live: GET /hr/candidates (?search=) and /hr/pipeline; POST
 * /hr/candidates adds a person or updates the one with that email; résumés
 * through POST/GET /hr/candidates/{id}/resume; POST /hr/applications puts a
 * pooled candidate forward for an opening.
 */
export function CandidatePool() {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [resume, setResume] = useState("");
  const list = useApi<Candidate[]>(`${BASE}/candidates`, { search });
  const pipeline = useApi<Pipeline>(`${BASE}/pipeline`);
  const openings = useApi<Opening[]>(`${BASE}/openings`);
  const [adding, closeAdding] = useNewFlag();
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [forward, setForward] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<Candidate | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const items = useMemo(
    () => (list.data ?? []).filter((c) => (!source || c.source === source) && (!resume || (resume === "yes") === c.has_resume)),
    [list.data, source, resume],
  );

  const p = pipeline.data;
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
  const stats = [
    { label: "Candidates", value: n(list.data && !search ? list.data.length : undefined), note: search ? "Clear the search to count" : "In the pool (up to 300 shown)" },
    { label: "In progress", value: n(p?.in_progress), note: "Applications still moving" },
    { label: "Open positions", value: n(p?.open_positions), note: p ? `Across ${p.openings_open} open posting${p.openings_open === 1 ? "" : "s"}` : "Across open postings" },
    { label: "Hired", value: n(p ? (p.by_stage.hired ?? 0) : undefined), note: "Applications that ended in a hire" },
  ];

  const rows: Row[] = items.map((c) => [
    { name: c.full_name, sub: c.email },
    c.phone ?? "—",
    c.qualification ?? "—",
    years(c.experience_years),
    label(c.source),
    String(c.applications),
    c.has_resume ? (c.resume_name ?? "On file") : "—",
  ]);

  async function run(fn: () => Promise<unknown>, done: string, inDialog = false) {
    setBusy(true);
    setError(null);
    setDialogError(null);
    try {
      await fn();
      notify(done);
      list.reload();
      pipeline.reload();
      return true;
    } catch (e) {
      (inDialog ? setDialogError : setError)(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(ev: FormEvent<HTMLFormElement>) {
    const body = candidateBody(new FormData(ev.currentTarget), editing ?? undefined);
    const ok = await run(() => api.post(`${BASE}/candidates`, body), editing ? `${body.full_name} updated.` : `${body.full_name} added to the pool.`, true);
    if (!ok) return;
    if (editing) setEditing(null);
    else closeAdding();
  }

  async function putForward(ev: FormEvent<HTMLFormElement>) {
    if (!forward) return;
    const f = new FormData(ev.currentTarget);
    const opening = openings.data?.find((o) => String(o.id) === String(f.get("opening_id")));
    const ok = await run(
      () => api.post(`${BASE}/applications`, { opening_id: Number(f.get("opening_id")), candidate: asCandidateIn(forward), notes: String(f.get("notes") ?? "").trim() || null }),
      `${forward.full_name} put forward for ${opening?.title ?? "the opening"}.`,
      true,
    );
    if (ok) setForward(null);
  }

  function pickResume(c: Candidate) {
    setUploadFor(c);
    file.current?.click();
  }

  async function upload(f: File | undefined) {
    const c = uploadFor;
    if (file.current) file.current.value = "";
    if (!c || !f) return;
    const form = new FormData();
    form.append("file", f);
    await run(() => api.upload(`${BASE}/candidates/${c.id}/resume`, form), `Résumé saved for ${c.full_name}.`);
    setUploadFor(null);
  }

  const download = (c: Candidate) => api.download(`${BASE}/candidates/${c.id}/resume`, c.resume_name ?? `resume-${c.full_name}`).catch((e) => setError(errorText(e)));

  const dialogOpen = adding || editing !== null;
  const current = editing;
  // Only published openings take applications (and not past their closing date).
  const now = today();
  const live = (openings.data ?? []).filter((o) => o.status === "open" && (!o.closes_on || o.closes_on >= now));
  const stageTotal = p ? Object.values(p.by_stage).reduce((a, b) => a + (b ?? 0), 0) : 0;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name, email or phone…" aria-label="Search candidates" />
        </div>
        <select aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by résumé" value={resume} onChange={(e) => setResume(e.target.value)}>
          <option value="">Any résumé</option>
          <option value="yes">Résumé on file</option>
          <option value="no">No résumé yet</option>
        </select>
      </div>
      <ErrorNote>{error ?? list.error ?? pipeline.error}</ErrorNote>
      <input ref={file} type="file" hidden accept=".pdf,.doc,.docx,.rtf,.txt,.odt" onChange={(e) => upload(e.target.files?.[0])} />
      <div className="two-col">
        <Panel title="Candidate pool" sub={`Everyone who has applied or been added, across all openings${list.loading ? " · Loading…" : ""}`} flush>
          <DataTable
            columns={["Candidate", "Phone", "Qualification", "Experience", "Source", "Applications", "Résumé"]}
            rows={rows}
            selectable={false}
            actions={(i) => {
              const c = items[i];
              return (
                <>
                  {c.has_resume ? (
                    <button type="button" className="btn" onClick={() => download(c)} title="Download résumé">
                      <Icon name="download" className="sm" />
                    </button>
                  ) : null}
                  <button type="button" className="btn" disabled={busy} onClick={() => pickResume(c)}>
                    {c.has_resume ? "Replace résumé" : "Upload résumé"}
                  </button>
                  <button type="button" className="btn" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                  <button type="button" className="btn" onClick={() => setForward(c)}>
                    Put forward
                  </button>
                </>
              );
            }}
            empty={list.loading ? "Loading candidates…" : search || source || resume ? "No candidate matches these filters." : undefined}
            emptyState={{
              title: "No candidates yet",
              note: "Add a candidate by hand, or they will appear here once someone applies through the careers page.",
              action: <NewLink icon="plus">Add candidate</NewLink>,
            }}
          />
        </Panel>
        <aside className="stack">
          <Panel title="Pipeline" sub="Applications by stage, all openings">
            {p ? (
              <div className="progress-stack">
                {STAGES.map((s) => {
                  const v = p.by_stage[s] ?? 0;
                  return (
                    <div key={s}>
                      <div className="progress-label">
                        <span>{label(s)}</span>
                        <strong>{v}</strong>
                      </div>
                      <div className="bar-track">
                        <i style={{ width: `${stageTotal ? (v / stageTotal) * 100 : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">{pipeline.loading ? "Loading…" : "—"}</p>
            )}
          </Panel>
        </aside>
      </div>

      <Dialog
        open={dialogOpen}
        title={current ? `Edit ${current.full_name}` : "Add candidate"}
        onClose={() => {
          setDialogError(null);
          if (current) setEditing(null);
          else closeAdding();
        }}
        onSubmit={save}
        wide
        actions={
          <>
            <button type="button" className="btn" onClick={() => (current ? setEditing(null) : closeAdding())}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              <Icon name="check" className="sm" />
              {busy ? "Saving…" : current ? "Save candidate" : "Add to pool"}
            </button>
          </>
        }
      >
        <ErrorNote>{dialogError}</ErrorNote>
        <div className="form-grid" key={current?.id ?? "new"}>
          <Field label="Full name" required>
            <input name="full_name" required minLength={2} maxLength={160} defaultValue={current?.full_name} />
          </Field>
          <Field label="Email address" required>
            <input name="email" type="email" required minLength={5} maxLength={255} defaultValue={current?.email} readOnly={Boolean(current)} />
          </Field>
          <Field label="Phone">
            <input name="phone" maxLength={20} defaultValue={current?.phone ?? ""} />
          </Field>
          <Field label="Source">
            <select name="source" defaultValue={current?.source ?? "walk_in"}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Qualification">
            <input name="qualification" maxLength={200} defaultValue={current?.qualification ?? ""} placeholder="e.g. M.Sc. Mathematics, B.Ed." />
          </Field>
          <Field label="Experience (years)">
            <input name="experience_years" type="number" min={0} max={60} step="0.5" defaultValue={current?.experience_years ?? ""} />
          </Field>
          <Field label="Current employer" full>
            <input name="current_employer" maxLength={160} defaultValue={current?.current_employer ?? ""} />
          </Field>
          <Field label="Notes" full>
            <textarea name="notes" maxLength={5000} defaultValue={current?.notes ?? ""} />
          </Field>
        </div>
        {current ? <p className="small muted">The email identifies the candidate, so it cannot be changed here. Add the person again to use a new address.</p> : null}
      </Dialog>

      <Dialog
        open={forward !== null}
        title={forward ? `Put ${forward.full_name} forward` : "Put forward"}
        onClose={() => {
          setDialogError(null);
          setForward(null);
        }}
        onSubmit={putForward}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setForward(null)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy || !live.length}>
              <Icon name="check" className="sm" />
              {busy ? "Saving…" : "Add application"}
            </button>
          </>
        }
      >
        <ErrorNote>{dialogError}</ErrorNote>
        <div className="form-grid">
          <Field label="Opening" required full>
            <select name="opening_id" required defaultValue="">
              <option value="">{live.length ? "Select opening" : "No openings are taking applications"}</option>
              {live.map((o) => (
                <option key={o.id} value={o.id}>
                  {`${o.title} · ${o.reference_no}${o.department_name ? ` · ${o.department_name}` : ""}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" full>
            <textarea name="notes" maxLength={5000} placeholder="Why they fit this post (optional)" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
