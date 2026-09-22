"use client";

/*
 * A student's achievements and milestones (a reading target, a prize), which
 * parents see on PM-057 Behaviour & achievements:
 * GET /api/v1/school/parent-services/achievements?student_id=, POST to add,
 * PATCH /achievements/{id} to move a milestone on, DELETE to remove.
 * Class and subject teachers, the principal and the school admin record them.
 */

import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";

const PATH = "/api/v1/school/parent-services/achievements";
const CATEGORIES = ["academic", "reading", "sports", "arts", "service", "conduct", "other"];

type Achievement = {
  id: number;
  title: string;
  category: string;
  description: string | null;
  status: "achieved" | "in_progress";
  achieved_on: string | null;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  shared_with_parents: boolean;
  recorded_by_name: string | null;
};

export function AchievementsDialog({ student, onClose }: { student: { student_id: number; full_name: string }; onClose: () => void }) {
  const list = useApi<Achievement[]>(PATH, { student_id: student.student_id });
  const [f, setF] = useState({ title: "", category: "academic", kind: "achieved", target: "", current: "", unit: "", description: "", shared: true });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setFailed(null);
    try {
      await fn();
      notify(done);
      list.reload();
      return true;
    } catch (e) {
      setFailed(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const milestone = f.kind === "in_progress";
    const ok = await run(
      () =>
        api.post(PATH, {
          student_id: student.student_id,
          title: f.title.trim(),
          category: f.category,
          status: f.kind,
          description: f.description.trim() || null,
          target_value: milestone && f.target ? Number(f.target) : null,
          current_value: milestone && f.current ? Number(f.current) : null,
          unit: milestone ? f.unit.trim() || null : null,
          shared_with_parents: f.shared,
        }),
      milestone ? "Milestone added." : "Achievement recorded.",
    );
    if (ok) setF({ ...f, title: "", target: "", current: "", unit: "", description: "" });
  }

  function progress(a: Achievement) {
    const v = window.prompt(`Progress on “${a.title}” (out of ${a.target_value}${a.unit ? ` ${a.unit}` : ""}):`, String(a.current_value ?? 0));
    if (v === null || v.trim() === "" || Number.isNaN(Number(v))) return;
    run(() => api.patch(`${PATH}/${a.id}`, { current_value: Number(v) }), "Progress updated.");
  }

  const items = list.data ?? [];
  const rows: Row[] = items.map((a) => [
    { name: a.title, sub: a.description ?? undefined },
    label(a.category),
    a.status === "in_progress" ? `${a.current_value ?? 0} / ${a.target_value}${a.unit ? ` ${a.unit}` : ""}` : `Achieved ${date(a.achieved_on)}`,
    a.shared_with_parents ? "Shared" : "Staff only",
    a.recorded_by_name ?? "—",
  ]);

  return (
    <Dialog
      open
      wide
      title={`Achievements · ${student.full_name}`}
      onClose={onClose}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <ErrorNote>{failed ?? list.error}</ErrorNote>
      <DataTable
        columns={["Achievement", "Category", "Progress", "Parents", "Recorded by"]}
        rows={rows}
        selectable={false}
        empty={list.loading ? "Loading…" : "Nothing recorded yet."}
        actions={(i) => {
          const a = items[i];
          return (
            <>
              {a.status === "in_progress" ? (
                <button type="button" className="btn" disabled={busy} onClick={() => progress(a)}>
                  Update
                </button>
              ) : null}
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => window.confirm(`Remove “${a.title}”?`) && run(() => api.delete(`${PATH}/${a.id}`), "Removed.")}
              >
                Remove
              </button>
            </>
          );
        }}
      />
      <form onSubmit={add} style={{ marginTop: 16 }}>
        <div className="form-grid">
          <label className="field">
            <span>
              Title<span className="req">*</span>
            </span>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={2} maxLength={160} placeholder="Read 10 books this term" />
          </label>
          <label className="field">
            <span>Category</span>
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Type</span>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="achieved">Achievement (done)</option>
              <option value="in_progress">Milestone with a target</option>
            </select>
          </label>
          {f.kind === "in_progress" ? (
            <>
              <label className="field">
                <span>
                  Target<span className="req">*</span>
                </span>
                <input type="number" min={1} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} required />
              </label>
              <label className="field">
                <span>So far</span>
                <input type="number" min={0} value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
              </label>
              <label className="field">
                <span>Unit</span>
                <input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="books" maxLength={40} />
              </label>
            </>
          ) : null}
          <label className="field">
            <span>Share with parents</span>
            <select value={f.shared ? "yes" : "no"} onChange={(e) => setF({ ...f, shared: e.target.value === "yes" })}>
              <option value="yes">Yes, show in the parent app</option>
              <option value="no">No, staff only</option>
            </select>
          </label>
          <label className="field full">
            <span>Details</span>
            <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} />
          </label>
        </div>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add"}
        </button>
      </form>
    </Dialog>
  );
}
