"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, KV, SectionTitle } from "./bits";
import type { AcademicYear, Branch, Term } from "./types";

type Status = "current" | "active" | "archived";
const statusOf = (y: AcademicYear): Status => (y.is_current ? "current" : y.is_archived ? "archived" : "active");
const STATUS_LABEL: Record<Status, string> = { current: "Current", active: "Active", archived: "Archived" };

/**
 * SCR-028, live. Pick a year (?id=) to edit its dates and status, or
 * "New academic year" to create one. Status maps to set-current, archive
 * and unarchive, which the API keeps as separate actions.
 */
export function AcademicYearSetup() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years", { include_archived: true });
  const branches = useApi<Branch[]>("/api/v1/school/branches");
  const year = id ? years.data?.find((y) => String(y.id) === id) : undefined;
  const terms = useApi<Term[]>(year ? `/api/v1/school/academic-years/${year.id}/terms` : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (years.loading && !years.data) return <Loading what="Loading academic years…" />;
  const current = years.data?.find((y) => y.is_current);
  const main = branches.data?.find((b) => b.is_main);
  const pick = (v: string) => router.replace(v ? `${routeOf(28)}?id=${v}` : routeOf(28));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const start = String(f.get("start_date") ?? "");
    const end = String(f.get("end_date") ?? "");
    const status = String(f.get("status") ?? "active") as Status;
    if (start && end && end <= start) {
      setError("The end date must be after the start date.");
      return;
    }
    if (year?.is_current && status !== "current") {
      setError("One year must stay current. Make another year current instead.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!year) {
        const created = await api.post<AcademicYear>("/api/v1/school/academic-years", {
          name: String(f.get("name") ?? "").trim(),
          start_date: start,
          end_date: end,
          is_current: status === "current",
        });
        notify(`${created.name} created.`);
        await years.reload();
        router.replace(`${routeOf(28)}?id=${created.id}`);
        return;
      }
      // An archived year can't be edited: unarchive first, change the dates,
      // and archive last so the dates are saved before it locks.
      const before = statusOf(year);
      if (before === "archived" && status !== "archived") await api.post(`/api/v1/school/academic-years/${year.id}/unarchive`);
      if (before !== "archived" || status !== "archived") await api.patch(`/api/v1/school/academic-years/${year.id}`, { start_date: start, end_date: end });
      if (status !== before) {
        if (status === "current") await api.post(`/api/v1/school/academic-years/${year.id}/set-current`);
        if (status === "archived") await api.post(`/api/v1/school/academic-years/${year.id}/archive`);
      }
      notify(`${year.name} saved.`);
      await years.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!year || !window.confirm(`Delete ${year.name}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/api/v1/school/academic-years/${year.id}`);
      notify(`${year.name} deleted.`);
      await years.reload();
      pick("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const termList = terms.data ?? [];

  return (
    <div className="two-col">
      <form id="year-form" key={year?.id ?? "new"} className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? years.error ?? (id && years.data && !year ? "That academic year was not found." : null)}</ErrorNote>
          <div className="form-sections">
            <section>
              <SectionTitle n="01">Details</SectionTitle>
              <div className="form-grid">
                <Field label="Academic year" required>
                  <select aria-label="Academic year" value={year ? String(year.id) : ""} onChange={(e) => pick(e.target.value)}>
                    <option value="">New academic year…</option>
                    {years.data?.map((y) => (
                      <option key={y.id} value={y.id}>
                        {`${y.name}${y.is_current ? " (current)" : y.is_archived ? " (archived)" : ""}`}
                      </option>
                    ))}
                  </select>
                </Field>
                {!year ? (
                  <Field label="Year name" required>
                    <input type="text" name="name" required minLength={2} maxLength={40} placeholder="e.g. 2027-28" />
                  </Field>
                ) : null}
                <Field label="Start date" required>
                  <input type="date" name="start_date" required defaultValue={year?.start_date ?? ""} />
                </Field>
                <Field label="End date" required>
                  <input type="date" name="end_date" required defaultValue={year?.end_date ?? ""} />
                </Field>
                {/* Not wired: Admission opens — the academic year has no admission date; no endpoint */}
                <Field label="Term structure">
                  <select aria-label="Term structure" disabled={!year}>
                    {!year ? <option>Add terms after saving the year</option> : null}
                    {year && !termList.length ? <option>{terms.loading ? "Loading terms…" : "No terms set up"}</option> : null}
                    {termList.map((t) => (
                      <option key={t.id}>{`${t.name} · ${date(t.start_date)} – ${date(t.end_date)}`}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select name="status" aria-label="Status" defaultValue={year ? statusOf(year) : "active"}>
                    <option value="current">Current</option>
                    <option value="active">Active</option>
                    {year ? <option value="archived">Archived</option> : null}
                  </select>
                </Field>
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            {year && !year.is_current ? (
              <button type="button" className="btn" onClick={remove} disabled={saving}>
                Delete
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : year ? "Save academic year" : "Create academic year"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>School setup</h3>
          <KV
            rows={[
              ["Academic year", current?.name ?? "None is current"],
              ["Branch", main?.name ?? (branches.data?.length ? `${branches.data.length} branches` : "Whole school")],
              ["Status", year ? STATUS_LABEL[statusOf(year)] : "New"],
            ]}
          />
          <div className="gap" />
          <p>
            {year
              ? `${year.name} runs ${date(year.start_date)} – ${date(year.end_date)}. Attendance, marks and fees are all kept per academic year; exactly one is current.`
              : "Choose a year to edit it, or fill in the dates to add a new one."}
          </p>
        </div>
      </aside>
    </div>
  );
}
