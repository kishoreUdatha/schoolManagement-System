"use client";

import { useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { ExamType } from "./types";

import { ask } from "@/lib/dialog";
/** SCR-139, live: GET/POST /school/exam-types, PUT/DELETE /school/exam-types/{id}. */
export function ExamTypes() {
  const list = useApi<ExamType[]>("/api/v1/school/exam-types");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<ExamType | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter(
      (t) =>
        (!q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)) &&
        (!status || (status === "active" ? t.is_active : !t.is_active)),
    );
  }, [list.data, search, status]);

  const rows: Row[] = shown.map((t) => [
    t.name,
    t.code,
    t.weight_percent !== null ? `${Number(t.weight_percent)}%` : "—",
    String(t.display_order),
    String(t.exams),
    t.is_active ? "Active" : "Inactive",
  ]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const weight = String(f.get("weight_percent") ?? "").trim();
    const body = {
      name: String(f.get("name")).trim(),
      code: String(f.get("code")).trim(),
      weight_percent: weight === "" ? null : Number(weight),
      display_order: Number(f.get("display_order") || 0),
      is_active: f.get("is_active") === "on",
    };
    setSaving(true);
    setError(null);
    try {
      if (editing && editing !== "new") await api.put(`/api/v1/school/exam-types/${editing.id}`, body);
      else await api.post("/api/v1/school/exam-types", body);
      notify(editing && editing !== "new" ? "Exam type updated." : "Exam type added.");
      setEditing(null);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: ExamType) {
    if (!(await ask(`Delete the exam type ${t.name}?`))) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/exam-types/${t.id}`);
      notify("Exam type deleted.");
      setEditing(null);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const cur = editing && editing !== "new" ? editing : null;

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exam types…" aria-label="Search records" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button type="button" className="btn primary" onClick={() => setEditing("new")}>
          <Icon name="plus" className="sm" />
          Add exam type
        </button>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      {editing ? (
        <form className="panel" style={{ marginBottom: 20 }} onSubmit={submit} key={cur?.id ?? "new"}>
          <div className="panel-head">
            <div>
              <h2>{cur ? `Edit ${cur.name}` : "New exam type"}</h2>
              <p>Weightage is the share this type carries in the final result.</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <label className="field">
                <span>
                  Exam type<span className="req">*</span>
                </span>
                <input name="name" required maxLength={120} defaultValue={cur?.name} placeholder="e.g. Unit test" />
              </label>
              <label className="field">
                <span>
                  Code<span className="req">*</span>
                </span>
                <input name="code" required maxLength={20} defaultValue={cur?.code} placeholder="e.g. UT" />
              </label>
              <label className="field">
                <span>Weightage (%)</span>
                <input name="weight_percent" type="number" min={0} max={100} step="0.01" defaultValue={cur?.weight_percent !== null && cur?.weight_percent !== undefined ? Number(cur.weight_percent) : ""} placeholder="Leave blank if not weighted" />
              </label>
              <label className="field">
                <span>Display order</span>
                <input name="display_order" type="number" min={0} max={999} defaultValue={cur?.display_order ?? 0} />
              </label>
              <label className="field">
                <span>Status</span>
                <span className="row">
                  <input type="checkbox" name="is_active" defaultChecked={cur ? cur.is_active : true} /> Active
                </span>
              </label>
            </div>
          </div>
          <div className="form-footer">
            <span>{cur ? `${cur.exams} exam${cur.exams === 1 ? "" : "s"} use this type` : "Fields marked * are required"}</span>
            <div className="actions">
              {cur ? (
                <button type="button" className="btn" onClick={() => remove(cur)}>
                  Delete
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : "Save exam type"}
              </button>
            </div>
          </div>
        </form>
      ) : null}
      <Panel title="All exam types" sub={`${list.data?.length ?? "…"} defined for the school${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Exam type", "Code", "Weightage", "Display order", "Exams using it", "Status"]}
          rows={rows}
          onView={(i) => setEditing(shown[i])}
          empty={list.loading ? "Loading exam types…" : search || status ? "No exam types match these filters." : "No exam types yet. Add the first one."}
        />
      </Panel>
    </>
  );
}
