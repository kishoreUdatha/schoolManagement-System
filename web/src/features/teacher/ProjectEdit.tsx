"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { Field, confirmed } from "@/features/self/kit";
import type { Project, ProjectKind } from "@/features/homework/types";

/** PATCH /teacher/projects/{id}: the fields the backend lets the author change. */
export function ProjectEditDialog({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);
  const [deadline, setDeadline] = useState(project.deadline);
  const [kind, setKind] = useState<ProjectKind>(project.kind);
  const [link, setLink] = useState(project.attachment_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(_e: FormEvent<HTMLFormElement>) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/v1/teacher/projects/${project.id}`, {
        title: title.trim(),
        description: description.trim(),
        deadline,
        kind,
        // The server applies every field sent, so an emptied field removes the link.
        attachment_url: link.trim() || null,
      });
      notify(`“${title.trim()}” updated.`);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title={`Edit assignment · ${project.title}`}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name="check" className="sm" />
            {busy ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <p className="small muted" style={{ marginBottom: 14 }}>{`${project.class_name ?? "—"} · ${project.subject_name ?? "—"}. The class and subject cannot be changed; delete and create again to move it.`}</p>
      <div className="form-grid">
        <Field label="Title" required full>
          <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Deadline" required>
          <input type="date" required value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <Field label="Type" required>
          <select value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
            <option value="individual">Individual</option>
            <option value="group">Group</option>
          </select>
        </Field>
        <Field label="Instructions" required full>
          <textarea required value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Reference link" full>
          <input type="url" maxLength={500} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
    </Dialog>
  );
}

/** DELETE /teacher/projects/{id}, after a confirmation. Resolves true when deleted. */
export async function deleteProject(project: Project): Promise<boolean> {
  if (!(await confirmed(`Delete “${project.title}”? Students' progress and submissions on it are removed too.`))) return false;
  await api.delete(`/api/v1/teacher/projects/${project.id}`);
  notify(`“${project.title}” deleted.`);
  return true;
}
