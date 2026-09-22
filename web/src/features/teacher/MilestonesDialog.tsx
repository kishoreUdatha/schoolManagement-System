"use client";

/*
 * A project's milestones (dated checkpoints parents see on PM-058 Projects &
 * activities): GET/POST /api/v1/school/parent-services/projects/{id}/milestones,
 * DELETE …/milestones/{mid}. The project's teacher manages them.
 */

import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";

type Milestone = { id: number; title: string; due_on: string | null; position: number };

export function MilestonesDialog({ project, onClose }: { project: { id: number; title: string; deadline: string }; onClose: () => void }) {
  const path = `/api/v1/school/parent-services/projects/${project.id}/milestones`;
  const list = useApi<Milestone[]>(path);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const items = list.data ?? [];

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
    const ok = await run(() => api.post(path, { title: title.trim(), due_on: due || null, position: items.length }), "Milestone added.");
    if (ok) {
      setTitle("");
      setDue("");
    }
  }

  const rows: Row[] = items.map((m, i) => [String(i + 1), m.title, m.due_on ? date(m.due_on) : "—"]);

  return (
    <Dialog
      open
      title={`Milestones · ${project.title}`}
      onClose={onClose}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <p className="small muted">{`Parents see these checkpoints with the project. Deadline ${date(project.deadline)}.`}</p>
      <ErrorNote>{failed ?? list.error}</ErrorNote>
      <DataTable
        columns={["#", "Milestone", "Due"]}
        rows={rows}
        selectable={false}
        empty={list.loading ? "Loading…" : "No milestones yet."}
        actions={(i) => (
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.delete(`${path}/${items[i].id}`), "Milestone removed.")}>
            Remove
          </button>
        )}
      />
      <form onSubmit={add} style={{ marginTop: 16 }}>
        <div className="form-grid">
          <label className="field">
            <span>
              Milestone<span className="req">*</span>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={200} placeholder="Research notes" />
          </label>
          <label className="field">
            <span>Due</span>
            <input type="date" value={due} max={project.deadline} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Add milestone"}
        </button>
      </form>
    </Dialog>
  );
}
