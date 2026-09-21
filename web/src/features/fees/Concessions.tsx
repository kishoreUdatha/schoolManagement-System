"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, initials, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Dialog, Field, isoToday, StudentPicker } from "./common";
import type { Concession, FeeHead, PickedStudent } from "./types";

const REASONS = ["sibling", "merit", "staff ward", "scholarship", "need-based", "sports quota", "other"];
const TONES = ["mint", "", "peach", "lilac"];

const describe = (c: Concession) => (c.kind === "percent" ? `${Number(c.value)}% off` : `${money(c.value)} off each fee`);

/**
 * SCR-163, live: GET /school/accounts/concessions (all, active and ended),
 * POST to give one, PATCH /{id} to amend, POST /{id}/end to stop it.
 * Concessions take effect when saved — the API has no request-and-approve
 * step — so the list shows what is in force rather than a queue.
 */
export function Concessions() {
  const list = useApi<Concession[]>("/api/v1/school/accounts/concessions", { active_only: false });
  const heads = useApi<FeeHead[]>("/api/v1/school/fees/heads", { active_only: true });
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState<Concession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = list.data ?? [];
  const active = all.filter((c) => c.is_active);
  const ended = all.filter((c) => !c.is_active);
  const classes = useMemo(() => Array.from(new Set(all.map((c) => c.section_label).filter((x): x is string => Boolean(x)))).sort(), [all]);
  const items = all.filter((c) => {
    const term = q.trim().toLowerCase();
    if (term && !`${c.student_name} ${c.reason} ${c.fee_head_name ?? ""}`.toLowerCase().includes(term)) return false;
    if (cls && c.section_label !== cls) return false;
    if (status === "active" && !c.is_active) return false;
    if (status === "ended" && c.is_active) return false;
    return true;
  });

  const n = (v: number) => (list.data ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "In force", value: n(active.length), note: "Reducing fees now" },
    { label: "Percentage", value: n(active.filter((c) => c.kind === "percent").length), note: "Percent off each fee" },
    { label: "Fixed amount", value: n(active.filter((c) => c.kind === "fixed").length), note: "Rupees off each fee" },
    { label: "Ended", value: n(ended.length), note: "No longer applied" },
  ];

  async function end(c: Concession) {
    if (!window.confirm(`End the ${describe(c)} concession for ${c.student_name}? Fees raised from now on are charged in full.`)) return;
    setError(null);
    try {
      await api.post(`/api/v1/school/accounts/concessions/${c.id}/end`);
      notify("Concession ended.");
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search concession or scholarship…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by class" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
          <option value="">All statuses</option>
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>{status === "ended" ? "Ended concessions" : status === "active" ? "Concessions in force" : "All concessions"}</strong>
            <span>{list.loading ? "Loading…" : `${items.length} shown`}</span>
          </div>
          {items.map((c, i) => (
            <article className="request-card" key={c.id}>
              <span className={`avatar ${TONES[i % 4]}`}>{initials(c.student_name)}</span>
              <div className="request-info">
                <h3>{c.student_name}</h3>
                <p>{`Class: ${c.section_label ?? "—"} · Concession: ${describe(c)} · On: ${c.fee_head_name ?? "All fees"}`}</p>
                <p>{`${label(c.reason)} · ${date(c.valid_from)} → ${c.valid_to ? date(c.valid_to) : "open"} · Approved by ${c.approved_by_name ?? "—"}`}</p>
              </div>
              <div className="actions">
                <Badge>{c.is_active ? "Active" : "Ended"}</Badge>
                <Link className="btn" href={`${routeOf(161)}?id=${c.student_id}`}>
                  Ledger
                </Link>
                {c.is_active ? (
                  <>
                    <button type="button" className="btn" onClick={() => setEditing(c)}>
                      Amend
                    </button>
                    <button type="button" className="btn" onClick={() => end(c)}>
                      End
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
          {!items.length && !list.loading ? <div className="panel-pad muted">No concessions match these filters.</div> : null}
        </div>
        <aside className="stack">
          <NewConcession heads={heads.data ?? []} onSaved={list.reload} />
          <Panel title="Recently ended">
            {ended.slice(0, 3).map((c) => (
              <div className="timeline-item" key={c.id}>
                <span className="timeline-dot">
                  <Icon name="file" />
                </span>
                <div>
                  <h4>{`${c.student_name} · ${describe(c)}`}</h4>
                  <p>{`${label(c.reason)} · ${c.fee_head_name ?? "All fees"}`}</p>
                </div>
                <time>{c.valid_to ? date(c.valid_to) : "—"}</time>
              </div>
            ))}
            {!ended.length ? <p className="muted small">{list.loading ? "Loading…" : "None ended yet."}</p> : null}
          </Panel>
        </aside>
      </div>
      {editing ? (
        <Amend
          c={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

function NewConcession({ heads, onSaved }: { heads: FeeHead[]; onSaved: () => void }) {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [f, setF] = useState({ fee_head_id: "", kind: "percent", value: "", reason: "sibling", valid_from: isoToday(), valid_to: "", notes: "", apply_to_pending: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!student) {
      setError("Choose the student.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<Concession>("/api/v1/school/accounts/concessions", {
        student_id: student.id,
        fee_head_id: f.fee_head_id ? Number(f.fee_head_id) : null,
        kind: f.kind,
        value: f.value,
        reason: f.reason,
        valid_from: f.valid_from,
        valid_to: f.valid_to || null,
        notes: f.notes.trim() || null,
        apply_to_pending: f.apply_to_pending,
      });
      notify(`Concession saved${r.applied_to_pending ? `; ${r.applied_to_pending} unpaid fee(s) reduced` : ""}.`);
      setStudent(null);
      setF({ ...f, value: "", notes: "" });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="aside-panel" onSubmit={save}>
      <h3>Give a concession</h3>
      <ErrorNote>{error}</ErrorNote>
      <div className="stack">
        <StudentPicker value={student} onChange={setStudent} />
        <Field label="On fee">
          <select value={f.fee_head_id} onChange={set("fee_head_id")}>
            <option value="">All fees</option>
            {heads.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" required>
          <select value={f.reason} onChange={set("reason")}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type" required>
          <select value={f.kind} onChange={set("kind")}>
            <option value="percent">% off</option>
            <option value="fixed">₹ off each fee</option>
          </select>
        </Field>
        <Field label={f.kind === "percent" ? "Percent" : "Amount (₹)"} required>
          <input type="number" min={0.01} max={f.kind === "percent" ? 100 : undefined} step="0.01" value={f.value} onChange={set("value")} required />
        </Field>
        <Field label="From" required>
          <input type="date" value={f.valid_from} onChange={set("valid_from")} required />
        </Field>
        <Field label="Until">
          <input type="date" value={f.valid_to} onChange={set("valid_to")} />
        </Field>
        <label className="check-item">
          <input type="checkbox" checked={f.apply_to_pending} onChange={(e) => setF({ ...f, apply_to_pending: e.target.checked })} />
          <span>Also reduce unpaid fees already raised in this period</span>
        </label>
        <button type="submit" className="btn primary" disabled={saving || !student}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : "Save concession"}
        </button>
      </div>
    </form>
  );
}

function Amend({ c, onClose, onSaved }: { c: Concession; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ kind: c.kind as string, value: String(Number(c.value)), reason: c.reason, valid_to: c.valid_to ?? "", notes: c.notes ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/v1/school/accounts/concessions/${c.id}`, { kind: f.kind, value: f.value, reason: f.reason, valid_to: f.valid_to || null, notes: f.notes.trim() || null });
      notify("Concession amended. Fees raised from now on use the new terms.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={`Amend concession · ${c.student_name}`} onClose={onClose}>
      <form onSubmit={save}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Type" required>
            <select value={f.kind} onChange={set("kind")}>
              <option value="percent">% off</option>
              <option value="fixed">₹ off each fee</option>
            </select>
          </Field>
          <Field label={f.kind === "percent" ? "Percent" : "Amount (₹)"} required>
            <input type="number" min={0.01} max={f.kind === "percent" ? 100 : undefined} step="0.01" value={f.value} onChange={set("value")} required />
          </Field>
          <Field label="Reason" required>
            <input value={f.reason} onChange={set("reason")} minLength={2} maxLength={80} required />
          </Field>
          <Field label="Until">
            <input type="date" value={f.valid_to} onChange={set("valid_to")} />
          </Field>
          <Field label="Notes" full>
            <textarea value={f.notes} onChange={set("notes")} maxLength={1000} />
          </Field>
        </div>
        <div className="row actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
