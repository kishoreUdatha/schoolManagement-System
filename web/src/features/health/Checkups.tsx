"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { Field, Kv, confirmed, formText, today, useNewFlag } from "@/features/transport/kit";
import { HEALTH, RecordBanner, RecordPicker, useRecord } from "./Clinic";
import type { Checkup } from "./types";

const ROUTE = "/health-wellbeing/health-checkups";
const unit = (v: string | null, u: string) => (v ? `${Number(v)} ${u}` : "—");
const vision = (c: Checkup) => (c.vision_left || c.vision_right ? `L ${c.vision_left ?? "—"} · R ${c.vision_right ?? "—"}` : "—");

/**
 * NEW-071, live: a student's check-ups from GET /health/students/{id} (?id=),
 * POST /health/students/{id}/checkups and DELETE /health/checkups/{id}.
 * Without ?id= a search of /health/profiles. Shows only what the API returns.
 */
export function HealthCheckups() {
  const { id, rec } = useRecord();
  const [adding, closeAdd] = useNewFlag();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!id) return <RecordPicker route={ROUTE} />;
  if (rec.loading && !rec.data) return <Loading what="Loading the health record…" />;
  const r = rec.data;
  if (!r) return <ErrorNote>{rec.error ?? "Record not found."}</ErrorNote>;

  const checkups = [...r.checkups].sort((a, b) => b.checked_on.localeCompare(a.checked_on));
  const last = checkups[0];
  const stats = [
    { label: "Check-ups", value: String(checkups.length), note: last ? `Last on ${date(last.checked_on)}` : "None recorded" },
    { label: "Height", value: unit(last?.height_cm ?? null, "cm"), note: "At the last check-up" },
    { label: "Weight", value: unit(last?.weight_kg ?? null, "kg"), note: "At the last check-up" },
    { label: "BMI", value: last?.bmi ? String(Number(last.bmi)) : "—", note: "Worked out from height and weight" },
  ];
  const rows: Row[] = checkups.map((c) => [date(c.checked_on), unit(c.height_cm, "cm"), unit(c.weight_kg, "kg"), c.bmi ? String(Number(c.bmi)) : "—", vision(c), c.dental ?? "—", c.notes ?? "—"]);

  async function add(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.post(`${HEALTH}/students/${id}/checkups`, {
        checked_on: formText(f, "checked_on"),
        height_cm: formText(f, "height_cm"),
        weight_kg: formText(f, "weight_kg"),
        vision_left: formText(f, "vision_left"),
        vision_right: formText(f, "vision_right"),
        dental: formText(f, "dental"),
        notes: formText(f, "notes"),
      });
      notify("Check-up recorded.");
      closeAdd();
      rec.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Checkup) {
    if (!confirmed(`Delete the check-up of ${date(c.checked_on)}? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`${HEALTH}/checkups/${c.id}`);
      notify("Check-up deleted.");
      rec.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <RecordBanner r={r} />
      <StatStrip items={stats} compact />
      <ErrorNote>{!adding ? error : null}</ErrorNote>
      <div className="two-col">
        <Panel title="Check-ups" sub="Most recent first" flush>
          <DataTable
            columns={["Date", "Height", "Weight", "BMI", "Vision", "Dental", "Notes"]}
            rows={rows}
            selectable={false}
            actions={(i) => (
              <button type="button" className="btn" onClick={() => remove(checkups[i])}>
                Delete
              </button>
            )}
            empty="No check-ups recorded for this student."
          />
        </Panel>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Last check-up</h3>
            {last ? (
              <Kv
                rows={[
                  ["Date", date(last.checked_on)],
                  ["Height", unit(last.height_cm, "cm")],
                  ["Weight", unit(last.weight_kg, "kg")],
                  ["BMI", last.bmi ? String(Number(last.bmi)) : "—"],
                  ["Vision", vision(last)],
                  ["Dental", last.dental ?? "—"],
                ]}
              />
            ) : (
              <p>No check-ups recorded.</p>
            )}
            <div className="gap" />
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <Link href={`${routeOf(217)}?id=${r.student_id}`} className="btn">
                Medical profile
              </Link>
              <Link href={ROUTE} className="btn">
                Another student
              </Link>
            </div>
          </div>
        </aside>
      </div>
      <Dialog
        open={adding}
        title={`Record a check-up · ${r.student_name}`}
        onClose={closeAdd}
        onSubmit={add}
        actions={
          <>
            <button type="button" className="btn" onClick={closeAdd}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save check-up"}
            </button>
          </>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Date" required>
            <input type="date" name="checked_on" required defaultValue={today()} max={today()} />
          </Field>
          <Field label="Height (cm)">
            <input type="number" name="height_cm" min={30} max={250} step="0.1" />
          </Field>
          <Field label="Weight (kg)">
            <input type="number" name="weight_kg" min={2} max={250} step="0.1" />
          </Field>
          <Field label="Vision, left eye">
            <input name="vision_left" placeholder="e.g. 6/6" />
          </Field>
          <Field label="Vision, right eye">
            <input name="vision_right" placeholder="e.g. 6/6" />
          </Field>
          <Field label="Dental">
            <input name="dental" />
          </Field>
          <Field label="Notes" full>
            <textarea name="notes" />
          </Field>
        </div>
        <p className="muted small">BMI is worked out from height and weight when both are given.</p>
      </Dialog>
    </>
  );
}

/** Page-head "Record check-up" once a student is open. */
export function AddCheckupLink() {
  const id = useSearchParams().get("id");
  if (!id) return null;
  return (
    <Link href={`${ROUTE}?id=${id}&new=1`} className="btn primary" scroll={false}>
      <Icon name="plus" className="sm" />
      Record check-up
    </Link>
  );
}
