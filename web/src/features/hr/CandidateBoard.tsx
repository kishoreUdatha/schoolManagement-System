"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Application, Opening, Stage } from "./types";
import { AVATAR_TONES, Dialog, Field, useNewFlag } from "./ui";

const BASE = "/api/v1/school/hr";
const SOURCES = ["website", "referral", "agency", "walk_in", "job_portal", "other"];

/** The mock's four columns, each holding the stages that belong there. */
const COLUMNS: { title: string; stages: Stage[]; dropTo: Stage | "offer" | null }[] = [
  { title: "New", stages: ["applied"], dropTo: null },
  { title: "In review", stages: ["screening", "shortlisted"], dropTo: "screening" },
  { title: "Interview", stages: ["interview"], dropTo: "interview" },
  { title: "Selected", stages: ["offered", "hired"], dropTo: "offer" },
];
const CLOSED: Stage[] = ["rejected", "withdrawn"];

/**
 * SCR-174, live: GET /api/v1/school/hr/applications (opening filter),
 * POST /hr/applications/{id}/stage when a card is dropped, POST
 * /hr/applications to add a candidate. Dropping on "Selected" opens the
 * offer screen: an offer is drafted there, not by moving a card.
 */
export function CandidateBoard() {
  const router = useRouter();
  const params = useSearchParams();
  const [openingId, setOpeningId] = useState(params.get("opening") ?? "");
  const [stage, setStage] = useState("");
  const [typed, setTyped] = useState("");
  const openings = useApi<Opening[]>(`${BASE}/openings`);
  const apps = useApi<Application[]>(`${BASE}/applications`, { opening_id: openingId });
  const [adding, closeAdding] = useNewFlag();
  const [addingTo, setAddingTo] = useState(false);
  const [dragged, setDragged] = useState<Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (apps.data ?? []).filter(
      (a) => (!stage || a.stage === stage) && (!q || [a.candidate_name, a.candidate_email, a.opening_title].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [apps.data, stage, typed]);

  const closed = items.filter((a) => CLOSED.includes(a.stage));
  const columns = closed.length ? [...COLUMNS, { title: "Not selected", stages: CLOSED, dropTo: null }] : COLUMNS;

  async function move(a: Application, to: Stage | "offer") {
    if (to === "offer") {
      router.push(`${routeOf(177)}?id=${a.id}`);
      return;
    }
    if (a.stage === to || a.stage === "hired") return;
    setError(null);
    try {
      await api.post(`${BASE}/applications/${a.id}/stage`, { stage: to });
      notify(`${a.candidate_name} moved to ${label(to)}.`);
      apps.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<Application>(`${BASE}/applications`, {
        opening_id: Number(text("opening_id")),
        notes: text("notes") || null,
        candidate: {
          full_name: text("full_name"),
          email: text("email"),
          phone: text("phone") || null,
          source: text("source") || "website",
          qualification: text("qualification") || null,
          experience_years: text("experience_years") || null,
          current_employer: text("current_employer") || null,
        },
      });
      notify(`${created.candidate_name} added to ${created.opening_title}.`);
      closeAdding();
      setAddingTo(false);
      apps.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const drop = (to: Stage | "offer" | null) => (e: DragEvent) => {
    e.preventDefault();
    if (dragged && to) move(dragged, to);
    setDragged(null);
  };

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search candidate applications…" aria-label="Search applications" />
        </div>
        <select aria-label="Filter by opening" value={openingId} onChange={(e) => setOpeningId(e.target.value)}>
          <option value="">All openings</option>
          {openings.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
        <select aria-label="Filter by stage" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>
          {["applied", "screening", "shortlisted", "interview", "offered", "hired", "rejected", "withdrawn"].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? apps.error}</ErrorNote>
      {apps.loading && !apps.data ? <p className="muted">Loading applications…</p> : null}
      <div className="kanban">
        {columns.map((col) => {
          const cards = items.filter((a) => col.stages.includes(a.stage));
          return (
            <section className="kanban-col" key={col.title} onDragOver={(e) => col.dropTo && e.preventDefault()} onDrop={drop(col.dropTo)}>
              <div className="kanban-title">
                {col.title}
                <span>{cards.length}</span>
              </div>
              {cards.map((a, i) => (
                <article
                  className="kanban-card"
                  key={a.id}
                  draggable={a.stage !== "hired"}
                  onDragStart={() => setDragged(a)}
                  onDragEnd={() => setDragged(null)}
                  onClick={() => router.push(`${routeOf(175)}?id=${a.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="spread">
                    <small>{`#${a.id}`}</small>
                    <Badge>{label(a.stage)}</Badge>
                  </div>
                  <h3>{a.candidate_name}</h3>
                  <p>{`${a.opening_title}${a.experience_years ? ` · ${Number(a.experience_years)} years experience` : ""}`}</p>
                  <div className="spread">
                    <span className={`avatar ${AVATAR_TONES[i % 4]}`}>{initials(a.candidate_name)}</span>
                    <span>{date(a.applied_on)}</span>
                  </div>
                </article>
              ))}
              {col.title === "New" ? (
                <button type="button" className="kanban-add" onClick={() => setAddingTo(true)}>
                  + Add candidate
                </button>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className="gap" />
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Drag a card to In review or Interview to move it; drop it on Selected to draft an offer. Open a card for the full record.</span>
      </div>

      {adding || addingTo ? (
        <Dialog
          title="Add candidate"
          onClose={() => {
            closeAdding();
            setAddingTo(false);
          }}
          onSubmit={add}
          submit="Add candidate"
          busy={busy}
          error={error}
          wide
        >
          <div className="form-grid">
            <Field label="Opening" required>
              <select name="opening_id" required defaultValue={openingId}>
                <option value="">Select opening</option>
                {openings.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {`${o.title} (${label(o.status)})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Candidate name" required>
              <input name="full_name" required minLength={2} maxLength={160} />
            </Field>
            <Field label="Email address" required>
              <input name="email" type="email" required minLength={5} maxLength={255} />
            </Field>
            <Field label="Mobile number">
              <input name="phone" type="tel" maxLength={20} />
            </Field>
            <Field label="Qualification">
              <input name="qualification" maxLength={200} placeholder="M.Sc, B.Ed" />
            </Field>
            <Field label="Experience (years)">
              <input name="experience_years" type="number" min={0} max={60} step="0.5" />
            </Field>
            <Field label="Current employer">
              <input name="current_employer" maxLength={160} />
            </Field>
            <Field label="Source">
              <select name="source" defaultValue="website">
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" full>
              <textarea name="notes" rows={2} maxLength={5000} />
            </Field>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
