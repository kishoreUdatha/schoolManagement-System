"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import type { AcademicYear, SchoolClass } from "@/features/students/types";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field } from "./common";
import { ordinal } from "./FeeStructureList";
import type { FeeHead, FeeStructure } from "./types";

import { ask } from "@/lib/dialog";
type Draft = { id: number | null; fee_head_id: string; amount: string; due_day_of_month: string };
const EMPTY: Draft = { id: null, fee_head_id: "", amount: "", due_day_of_month: "10" };

/**
 * SCR-156, live. A class's fee structure is one line per fee type for the
 * year: POST /school/fees/structures adds a head, PATCH changes its amount
 * or due day, DELETE removes it. Opens on ?year=&class= from SCR-155.
 * The structure's name is PUT /school/fees/structure-names (saved on leaving the field).
 */
export function FeeStructureForm() {
  const params = useSearchParams();
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const heads = useApi<FeeHead[]>("/api/v1/school/fees/heads", { active_only: true });
  const [yearId, setYearId] = useState<number | null>(params.get("year") ? Number(params.get("year")) : null);
  const [classId, setClassId] = useState<number | null>(params.get("class") ? Number(params.get("class")) : null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);

  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const lines = useApi<FeeStructure[]>(yearId && classId ? "/api/v1/school/fees/structures" : null, { academic_year_id: yearId, class_id: classId });
  const names = useApi<{ academic_year_id: number; class_id: number; name: string }[]>(yearId ? "/api/v1/school/fees/structure-names" : null, { academic_year_id: yearId });
  const savedName = names.data?.find((n) => n.class_id === classId)?.name ?? "";
  const [name, setName] = useState("");
  useEffect(() => setName(savedName), [savedName, classId]);

  async function saveName() {
    if (!yearId || !classId || name.trim() === savedName) return;
    setError(null);
    try {
      await api.put("/api/v1/school/fees/structure-names", { academic_year_id: yearId, class_id: classId, name: name.trim() || null });
      notify(name.trim() ? "Structure name saved." : "Structure name cleared.");
      names.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const used = useMemo(() => new Set((lines.data ?? []).map((l) => l.fee_head_id)), [lines.data]);
  const available = (heads.data ?? []).filter((h) => !used.has(h.id) || h.id === Number(draft.fee_head_id));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!yearId || !classId) {
      setError("Choose the academic year and class first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const due = Number(draft.due_day_of_month) || 10;
      if (draft.id) {
        await api.patch(`/api/v1/school/fees/structures/${draft.id}`, { amount: draft.amount, due_day_of_month: due });
        notify("Fee component updated.");
      } else {
        await api.post("/api/v1/school/fees/structures", {
          academic_year_id: yearId,
          class_id: classId,
          fee_head_id: Number(draft.fee_head_id),
          amount: draft.amount,
          due_day_of_month: due,
        });
        notify("Fee component added.");
      }
      setDraft(EMPTY);
      lines.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(l: FeeStructure) {
    if (!(await ask(`Remove ${l.fee_head_name} from this class's fee structure? This is only possible while no fees have been raised from it.`))) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/fees/structures/${l.id}`);
      notify("Fee component removed.");
      if (draft.id === l.id) setDraft(EMPTY);
      lines.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="stack">
      <form id="fee-structure-form" className="panel" onSubmit={save}>
        <div className="panel-head">
          <h2>Fee structure details</h2>
        </div>
        <div className="panel-body">
          <ErrorNote>{error ?? years.error ?? heads.error ?? lines.error}</ErrorNote>
          <div className="form-grid">
            <Field label="Structure name">
              <input
                value={name}
                maxLength={160}
                disabled={!classId}
                placeholder={classId ? "e.g. Day scholar 2026-27" : "Choose the class first"}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveName();
                  }
                }}
              />
            </Field>
            <Field label="Academic year" required>
              <select
                value={yearId ?? ""}
                required
                onChange={(e) => {
                  setYearId(Number(e.target.value));
                  setClassId(null);
                  setDraft(EMPTY);
                }}
              >
                {years.data?.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Class" required>
              <select
                value={classId ?? ""}
                required
                onChange={(e) => {
                  setClassId(e.target.value ? Number(e.target.value) : null);
                  setDraft(EMPTY);
                }}
              >
                <option value="">{classes.loading ? "Loading classes…" : "Select class"}</option>
                {classes.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={draft.id ? "Fee type (editing)" : "Fee type"} required>
              <select value={draft.fee_head_id} required disabled={Boolean(draft.id) || !classId} onChange={(e) => setDraft({ ...draft, fee_head_id: e.target.value })}>
                <option value="">Select fee type</option>
                {available.map((h) => (
                  <option key={h.id} value={h.id}>
                    {`${h.name} · ${h.is_recurring ? "monthly" : "once"}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount per charge (₹)" required>
              <input type="number" min={0} step="0.01" required value={draft.amount} disabled={!classId} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="Enter amount" />
            </Field>
            <Field label="Due day of month" required>
              <input type="number" min={1} max={31} required value={draft.due_day_of_month} disabled={!classId} onChange={(e) => setDraft({ ...draft, due_day_of_month: e.target.value })} />
            </Field>
          </div>
        </div>
        <div className="form-footer">
          <span>{draft.id ? "Changing a line affects fees raised from now on." : "Each fee type is added to the class once."}</span>
          <div className="actions">
            {draft.id ? (
              <button type="button" className="btn" onClick={() => setDraft(EMPTY)}>
                Cancel edit
              </button>
            ) : null}
            <button type="submit" className="btn primary" disabled={saving || !classId}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : draft.id ? "Save component" : "Add component"}
            </button>
          </div>
        </div>
      </form>
      <Panel
        title="Fee types"
        sub={classId ? `${lines.data?.length ?? 0} component${lines.data?.length === 1 ? "" : "s"}` : "Choose a class to see its components"}
        flush
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Due date</th>
                <th>Status</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(lines.data ?? []).map((l) => (
                <tr key={l.id}>
                  <td>{`${l.fee_head_name} · ${l.fee_head_code}`}</td>
                  <td>{money(l.amount)}</td>
                  <td>{l.is_recurring ? "Monthly" : "Once"}</td>
                  <td>{`${ordinal(l.due_day_of_month)} of the month`}</td>
                  <td>
                    <Badge>{heads.data?.some((h) => h.id === l.fee_head_id) ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="right">
                    <button type="button" className="btn" onClick={() => setDraft({ id: l.id, fee_head_id: String(l.fee_head_id), amount: String(Number(l.amount)), due_day_of_month: String(l.due_day_of_month) })}>
                      Edit
                    </button>{" "}
                    <button type="button" className="btn" onClick={() => remove(l)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={Boolean(lines.data?.length)}>
          {!classId ? "Choose a class." : lines.loading ? "Loading…" : "No fee types on this class yet. Add the first component above."}
        </div>
      </Panel>
    </div>
  );
}
