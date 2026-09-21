"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { GradeScale } from "./types";

type BandDraft = { grade: string; min_percent: string; max_percent: string; points: string; remark: string; is_pass: boolean };
const blankBand = (): BandDraft => ({ grade: "", min_percent: "", max_percent: "", points: "", remark: "", is_pass: true });
const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));

/**
 * SCR-149, live: GET/POST /school/grade-scales, PUT/DELETE /grade-scales/{id},
 * POST /grade-scales/{id}/default and /grade-scales/seed-cbse.
 */
export function GradingSetup() {
  const scales = useApi<GradeScale[]>("/api/v1/school/grade-scales");
  const [pick, setPick] = useState<number | "new" | null>(null);
  const [bands, setBands] = useState<BandDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = scales.data ?? [];
  const cur = pick === "new" ? null : (list.find((s) => s.id === pick) ?? list.find((s) => s.is_default) ?? list[0] ?? null);
  const creating = pick === "new" || (!cur && !scales.loading);

  useEffect(() => {
    setBands(
      cur
        ? cur.bands.map((b) => ({ grade: b.grade, min_percent: str(b.min_percent), max_percent: str(b.max_percent), points: str(b.points), remark: b.remark ?? "", is_pass: b.is_pass }))
        : [blankBand()],
    );
  }, [cur]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(done);
      scales.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const clean = bands.filter((b) => b.grade.trim());
    if (!clean.length) {
      setError("Add at least one grade band.");
      return;
    }
    const bad = clean.find((b) => Number(b.min_percent) > Number(b.max_percent));
    if (bad) {
      setError(`Grade ${bad.grade}: the minimum is above the maximum.`);
      return;
    }
    const body = {
      name: String(f.get("name")).trim(),
      description: String(f.get("description") ?? "").trim() || null,
      is_default: f.get("is_default") === "on",
      is_active: f.get("is_active") === "on",
      bands: clean.map((b) => ({
        grade: b.grade.trim(),
        min_percent: Number(b.min_percent),
        max_percent: Number(b.max_percent),
        points: b.points.trim() === "" ? null : Number(b.points),
        remark: b.remark.trim() || null,
        is_pass: b.is_pass,
      })),
    };
    const ok = await run(() => (cur && !creating ? api.put(`/api/v1/school/grade-scales/${cur.id}`, body) : api.post("/api/v1/school/grade-scales", body)), "Grading scale saved.");
    if (ok && creating) setPick(null);
  }

  const setBand = (i: number, patch: Partial<BandDraft>) => setBands(bands.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const show = creating ? null : cur;

  return (
    <>
      <div className="filterbar">
        <select aria-label="Grading scale" value={creating ? "new" : (cur?.id ?? "")} onChange={(e) => setPick(e.target.value === "new" ? "new" : Number(e.target.value))}>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.name}${s.is_default ? " (default)" : ""}`}
            </option>
          ))}
          <option value="new">New scale…</option>
        </select>
        {!list.length && !scales.loading ? (
          <button type="button" className="btn" disabled={saving} onClick={() => run(() => api.post("/api/v1/school/grade-scales/seed-cbse"), "CBSE scale created.")}>
            <Icon name="plus" className="sm" />
            Start from the CBSE scale
          </button>
        ) : null}
        {show && !show.is_default ? (
          <button type="button" className="btn" disabled={saving} onClick={() => run(() => api.post(`/api/v1/school/grade-scales/${show.id}/default`), `${show.name} is now the default.`)}>
            Make default
          </button>
        ) : null}
        {show ? (
          <button type="button" className="btn" disabled={saving} onClick={() => window.confirm(`Delete ${show.name}?`) && run(() => api.delete(`/api/v1/school/grade-scales/${show.id}`), "Scale deleted.").then((ok) => ok && setPick(null))}>
            Delete
          </button>
        ) : null}
      </div>
      <div className="two-col">
        <form className="panel" onSubmit={submit} key={show?.id ?? "new"}>
          <div className="panel-pad">
            <ErrorNote>{error ?? scales.error}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Details</h3>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>
                      Scale name<span className="req">*</span>
                    </span>
                    <input name="name" required maxLength={120} defaultValue={show?.name} placeholder="e.g. CBSE 9-point" />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <span className="row">
                      <label className="row">
                        <input type="checkbox" name="is_active" defaultChecked={show ? show.is_active : true} /> Active
                      </label>
                      <label className="row">
                        <input type="checkbox" name="is_default" defaultChecked={show?.is_default ?? false} /> Default
                      </label>
                    </span>
                  </label>
                  <label className="field full">
                    <span>Description</span>
                    <textarea name="description" maxLength={1000} defaultValue={show?.description ?? ""} placeholder="Enter description" />
                  </label>
                </div>
              </section>
              <section>
                <div className="form-section-title">
                  <span className="number">02</span>
                  <h3>Grade bands</h3>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Minimum %</th>
                        <th>Maximum %</th>
                        <th>Grade point</th>
                        <th>Description</th>
                        <th>Pass</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {bands.map((b, i) => (
                        <tr key={i}>
                          <td>
                            <input className="marks-input" aria-label="Grade" required maxLength={8} value={b.grade} onChange={(e) => setBand(i, { grade: e.target.value })} />
                          </td>
                          <td>
                            <input className="marks-input" aria-label="Minimum percentage" type="number" min={0} max={100} step="0.01" required value={b.min_percent} onChange={(e) => setBand(i, { min_percent: e.target.value })} />
                          </td>
                          <td>
                            <input className="marks-input" aria-label="Maximum percentage" type="number" min={0} max={100} step="0.01" required value={b.max_percent} onChange={(e) => setBand(i, { max_percent: e.target.value })} />
                          </td>
                          <td>
                            <input className="marks-input" aria-label="Grade point" type="number" min={0} max={100} step="0.01" value={b.points} onChange={(e) => setBand(i, { points: e.target.value })} />
                          </td>
                          <td>
                            <input aria-label="Description" maxLength={120} value={b.remark} onChange={(e) => setBand(i, { remark: e.target.value })} placeholder="e.g. Outstanding" />
                          </td>
                          <td>
                            <input type="checkbox" aria-label="Counts as a pass" checked={b.is_pass} onChange={(e) => setBand(i, { is_pass: e.target.checked })} />
                          </td>
                          <td className="right">
                            <button type="button" className="btn" onClick={() => setBands(bands.filter((_, j) => j !== i))}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="gap" />
                <button type="button" className="btn" onClick={() => setBands([...bands, blankBand()])}>
                  <Icon name="plus" className="sm" />
                  Add band
                </button>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setPick(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : "Save grading scale"}
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Examinations</h3>
            <dl className="kv">
              <div>
                <dt>Scales</dt>
                <dd>{scales.loading ? "…" : String(list.length)}</dd>
              </div>
              <div>
                <dt>Used by</dt>
                <dd>{show ? `${show.used_by_exams} exam${show.used_by_exams === 1 ? "" : "s"}` : "—"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{show ? `${show.is_active ? "Active" : "Inactive"}${show.is_default ? " · Default" : ""}` : "New"}</dd>
              </div>
            </dl>
            <div className="gap" />
            <p>Marks already saved keep the grade they were given; re-save marks to re-grade them after changing a scale in use.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
