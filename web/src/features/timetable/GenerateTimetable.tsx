"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { DAY_SHORT, useSectionPick, useYearClasses } from "./shared";
import type { GenResult, Requirements } from "./types";

/**
 * SCR-124, live: GET /school/timetable-gen/sections/{id}/requirements,
 * PUT /timetable-gen/class-subjects/{id}/periods for each subject's weekly
 * count, POST /timetable-gen/sections/{id}/generate. The generator writes the
 * week straight away (there is no preview in the API); ?section= preselects.
 */
export function GenerateTimetable() {
  const router = useRouter();
  const preset = Number(useSearchParams().get("section")) || null;
  const { years, yearId, setYearId, year, classes } = useYearClasses();
  const pick = useSectionPick(classes.data, preset);
  const req = useApi<Requirements>(pick.sectionId ? `/api/v1/school/timetable-gen/sections/${pick.sectionId}/requirements` : null);
  const [replace, setReplace] = useState(true);
  const [seed, setSeed] = useState("");
  const [maxRun, setMaxRun] = useState("");
  const [roomPref, setRoomPref] = useState("none");
  const rooms = useApi<{ id: number; name: string; code: string; section_id: number | null }[]>("/api/v1/school/rooms");
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [result, setResult] = useState<GenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});

  useEffect(() => {
    setResult(null);
    setCounts({});
  }, [pick.sectionId]);

  const r = req.data?.section_id === pick.sectionId ? req.data : null;

  async function savePeriods(csId: number) {
    const value = Number(counts[csId]);
    if (!Number.isInteger(value) || value < 0) return;
    setSavingId(csId);
    setError(null);
    try {
      await api.put(`/api/v1/school/timetable-gen/class-subjects/${csId}/periods`, { periods_per_week: value });
      setCounts((c) => {
        const next = { ...c };
        delete next[csId];
        return next;
      });
      req.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSavingId(null);
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!pick.sectionId) {
      setError("Choose a class and section.");
      return;
    }
    if (replace && !window.confirm("Replace this section's whole week? Every lesson already placed is removed and placed again.")) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const out = await api.post<GenResult>(`/api/v1/school/timetable-gen/sections/${pick.sectionId}/generate`, {
        replace,
        seed: seed.trim() ? Number(seed) : null,
        max_consecutive: maxRun.trim() ? Number(maxRun) : null,
        room_preference: roomPref,
      });
      setResult(out);
      notify(
        (out.complete ? `Timetable generated: ${out.placed} lessons placed.` : `${out.placed} lessons placed; some could not fit.`) +
          (out.room_name ? ` Room: ${out.room_name}${out.without_room ? ` (${out.without_room} lesson(s) without it, it was taken)` : ""}.` : ""),
      );
      req.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const status = !r ? "…" : r.fits ? (r.unset.length ? `Fits · ${r.unset.length} subject(s) without a count` : "Fits the week") : `Over by ${r.over_by} period(s)`;

  return (
    <>
      <div className="two-col">
        <form id="generate-form" className="panel" onSubmit={generate}>
          <div className="panel-pad">
            <ErrorNote>{error ?? years.error ?? classes.error ?? req.error}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Details</h3>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>
                      Academic year
                      <span className="req">*</span>
                    </span>
                    <select required value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
                      {years.data?.map((y) => (
                        <option key={y.id} value={y.id}>
                          {`${y.name}${y.is_current ? " (current)" : ""}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Class
                      <span className="req">*</span>
                    </span>
                    <select required value={pick.classId ?? ""} onChange={(e) => pick.pickClass(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">{classes.loading ? "Loading classes…" : "Select class"}</option>
                      {classes.data?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Section
                      <span className="req">*</span>
                    </span>
                    <select required value={pick.sectionId ?? ""} disabled={!pick.cls} onChange={(e) => pick.setSectionId(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Select section</option>
                      {pick.cls?.sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Weekly periods</span>
                    <input type="text" readOnly value={r ? `${r.teaching_slots_per_week} teaching slots · ${r.periods_wanted} wanted` : "…"} />
                  </label>
                  <label className="field">
                    <span>Consecutive limit</span>
                    <input type="number" min={1} max={12} placeholder="Most periods in a row per teacher (blank: no limit)" value={maxRun} onChange={(e) => setMaxRun(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Room preference</span>
                    <select value={roomPref} onChange={(e) => setRoomPref(e.target.value)}>
                      <option value="none">No room (the class stays in its own room)</option>
                      <option value="home" disabled={!rooms.data?.some((x) => x.section_id === pick.sectionId)}>
                        {"The section's home room"}
                      </option>
                      {rooms.data?.map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {`${x.name} (${x.code})`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Existing lessons</span>
                    <select value={replace ? "replace" : "keep"} onChange={(e) => setReplace(e.target.value === "replace")}>
                      <option value="replace">Replace the whole week</option>
                      <option value="keep">Keep placed lessons, fill the gaps</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Shuffle seed</span>
                    <input type="number" placeholder="Blank for a fresh arrangement" value={seed} onChange={(e) => setSeed(e.target.value)} />
                  </label>
                </div>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Generating saves the week straight away. Check it in Timetable setup.</span>
            <div className="actions">
              <button type="button" className="btn" onClick={() => router.back()}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy || !pick.sectionId}>
                <Icon name="check" className="sm" />
                {busy ? "Generating…" : "Generate timetable"}
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Timetable</h3>
            <dl className="kv">
              <div>
                <dt>Academic year</dt>
                <dd>{year?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Section</dt>
                <dd>{pick.cls && pick.section ? `${pick.cls.name} ${pick.section.name}` : "—"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{status}</dd>
              </div>
            </dl>
            <div className="gap" />
            <p>Set how many periods each subject needs below, then generate. Teacher clashes and blocked hours are avoided.</p>
            {pick.sectionId ? (
              <Link href={`${routeOf(121)}?section=${pick.sectionId}`} className="btn text">
                Edit by hand
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
      <div className="gap" />
      {result ? (
        <>
          <Panel title="Result" sub={`${result.placed} lessons placed · ${result.left_empty} slots left empty`} action={<span className={`badge ${result.complete ? "" : "warn"}`}>{result.complete ? "Complete" : "Pending · incomplete"}</span>}>
            {result.unplaced.length ? (
              result.unplaced.map((u) => (
                <div className="timeline-item" key={u.class_subject_id}>
                  <span className="timeline-dot">
                    <Icon name="bell" />
                  </span>
                  <div>
                    <h4>{`${u.subject_name} · ${u.still_short} short`}</h4>
                    <p>{u.because}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">{`Every subject got its periods. First lessons: ${result.entries
                .slice(0, 4)
                .map((e) => `${e.subject_name} ${DAY_SHORT[e.day_of_week]} P${e.period_number}`)
                .join(", ")}${result.entries.length > 4 ? "…" : ""}`}</p>
            )}
          </Panel>
          <div className="gap" />
        </>
      ) : null}
      <Panel title="Periods per subject" sub={r ? `${r.periods_wanted} wanted of ${r.teaching_slots_per_week} slots` : undefined} flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Teacher</th>
                <th>Periods a week</th>
                <th>Placed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {r?.subjects.map((s) => {
                const val = counts[s.class_subject_id] ?? String(s.periods_per_week);
                const dirty = counts[s.class_subject_id] !== undefined && counts[s.class_subject_id] !== String(s.periods_per_week);
                const st = !s.has_teacher ? "No teacher" : s.short_by ? `Pending · ${s.short_by} short` : s.over_by ? `Overdue · ${s.over_by} over` : "Placed";
                return (
                  <tr key={s.class_subject_id}>
                    <td>{s.subject_name}</td>
                    <td>{s.teacher_name ?? "—"}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <input
                          className="marks-input"
                          type="number"
                          min={0}
                          max={60}
                          value={val}
                          aria-label={`${s.subject_name} periods a week`}
                          onChange={(e) => setCounts((c) => ({ ...c, [s.class_subject_id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              savePeriods(s.class_subject_id);
                            }
                          }}
                        />
                        {dirty ? (
                          <button type="button" className="btn text" disabled={savingId === s.class_subject_id} onClick={() => savePeriods(s.class_subject_id)}>
                            {savingId === s.class_subject_id ? "Saving…" : "Save"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>{s.placed}</td>
                    <td>
                      <span className={`badge ${!s.has_teacher || s.over_by ? "bad" : s.short_by ? "warn" : ""}`}>{st}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={Boolean(r?.subjects.length)}>
          {req.loading ? "Loading subjects…" : pick.sectionId ? "No subjects are assigned to this class yet." : "Choose a section."}
        </div>
      </Panel>
    </>
  );
}
