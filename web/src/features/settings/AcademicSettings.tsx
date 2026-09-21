"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, orNull } from "@/features/setup/bits";
import type { AcademicYear, SchoolProfile, Term } from "@/features/setup/types";
import { PROFILE, WorkingDays, readDays } from "./GeneralSettings";
import { SettingsNav } from "./SettingsNav";
import type { GradeScale, ReportCardSettings } from "./types";

const RC = "/api/v1/school/report-card-settings";

const TOGGLES: [keyof ReportCardSettings, string][] = [
  ["show_attendance", "Show attendance on report cards"],
  ["show_rank", "Show class rank"],
  ["show_grade_scale", "Print the grade scale"],
  ["show_remarks", "Print teacher remarks"],
  ["require_result_approval", "Results need approval before publishing"],
];

/**
 * SCR-290, live. The year and its terms are read here (they are set under
 * Academic Year Setup). Saving sends the default grade scale (POST
 * /grade-scales/{id}/default, only when it changed), the working days
 * (PATCH /profile) and the report-card settings (PUT /report-card-settings).
 */
export function AcademicSettings() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const current = years.data?.find((y) => y.is_current);
  const terms = useApi<Term[]>(current ? `/api/v1/school/academic-years/${current.id}/terms` : null);
  const scales = useApi<GradeScale[]>("/api/v1/school/grade-scales");
  const rc = useApi<ReportCardSettings>(RC);
  const profile = useApi<SchoolProfile>(PROFILE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if ((rc.loading && !rc.data) || (profile.loading && !profile.data)) return <Loading what="Loading academic settings…" />;
  const r = rc.data;
  const def = scales.data?.find((s) => s.is_default);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const days = readDays(f);
    if (!days) {
      setError("Tick at least one working day.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const scale = String(f.get("scale") ?? "");
      if (scale && scale !== String(def?.id ?? "")) await api.post(`/api/v1/school/grade-scales/${scale}/default`);
      await api.patch(PROFILE, { working_days: days });
      await api.put(RC, {
        ...Object.fromEntries(TOGGLES.map(([k]) => [k, f.get(k) === "on"])),
        principal_name: orNull(f.get("principal_name")),
        footer_note: orNull(f.get("footer_note")),
      });
      notify("Academic settings saved.");
      await Promise.all([scales.reload(), rc.reload(), profile.reload()]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const termList = terms.data ?? [];

  return (
    <div className="settings-layout">
      <SettingsNav active={290} />
      <div>
        <form id="academic-form" key={`${r?.id}-${profile.data?.updated_at}-${def?.id}`} className="panel" onSubmit={submit}>
          <div className="panel-head">
            <div>
              <h2>General configuration</h2>
              <p>{`${profile.data?.name ?? "This school"} · Changes apply after saving`}</p>
            </div>
          </div>
          <div className="panel-body">
            <ErrorNote>{error ?? rc.error ?? scales.error ?? years.error}</ErrorNote>
            <div className="form-grid">
              <Field label="Academic year">
                <select aria-label="Academic year" value={current?.id ?? ""} disabled>
                  {!current ? <option value="">None is current</option> : null}
                  {years.data?.map((y) => (
                    <option key={y.id} value={y.id}>
                      {`${y.name}${y.is_current ? " (current)" : ""}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Term structure">
                <select aria-label="Term structure" disabled>
                  {!termList.length ? <option>{terms.loading ? "Loading terms…" : "No terms set up"}</option> : null}
                  {termList.map((t) => (
                    <option key={t.id}>{`${t.name} · ${date(t.start_date)} – ${date(t.end_date)}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default grading scale">
                <select name="scale" aria-label="Default grading scale" defaultValue={def?.id ?? ""}>
                  {!def ? <option value="">{scales.loading ? "Loading…" : scales.data?.length ? "No default yet" : "No grade scales set up"}</option> : null}
                  {scales.data
                    ?.filter((s) => s.is_active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {`${s.name} · ${s.bands.length} grades`}
                      </option>
                    ))}
                </select>
              </Field>
              {/* Not wired: Attendance mode and Promotion threshold — no school-level setting for either; no endpoint */}
              <Field label="Principal name on report cards">
                <input type="text" name="principal_name" defaultValue={r?.principal_name ?? ""} placeholder="As printed on report cards" />
              </Field>
              <Field label="Working days" full>
                <WorkingDays value={profile.data?.working_days ?? ""} />
              </Field>
              <Field label="Report card footer" full>
                <input type="text" name="footer_note" defaultValue={r?.footer_note ?? ""} placeholder="Printed at the foot of every report card" />
              </Field>
              <Field label="Report cards" full>
                <div className="stack" style={{ gap: 6 }}>
                  {TOGGLES.map(([k, t]) => (
                    <label key={k} className="row" style={{ gap: 6 }}>
                      <input type="checkbox" name={k} defaultChecked={Boolean(r?.[k])} />
                      {t}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
            <div className="gap" />
            <div className="tip">
              <Icon name="shield" className="sm" />
              <span>Years and terms are set up under School setup · Academic Year Setup; grade scales under Examinations.</span>
            </div>
          </div>
          <div className="form-footer">
            <span>{profile.data ? `Last updated ${date(profile.data.updated_at)}` : ""}</span>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
