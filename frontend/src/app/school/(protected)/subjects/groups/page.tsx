"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Subject = { id: number; name: string; code: string; is_active: boolean };
type Member = {
  member_id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  is_elective: boolean;
};
type Group = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  subjects: Member[];
  subject_count: number;
  elective_count: number;
};

const base = "/api/v1/school/academics";

/** Subject groups: which subjects a school talks about together.
 *
 *  A group describes the subject list; it never owns it. Removing a subject
 *  here takes it out of the grouping and leaves the subject itself alone,
 *  which is why the action says "remove from group" rather than "delete".
 */
export default function SubjectGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const [pick, setPick] = useState<{ subject_id: string; is_elective: boolean }>({
    subject_id: "",
    is_elective: false,
  });

  const load = () =>
    api
      .get<Group[]>(`${base}/groups`)
      .then((r) => setGroups(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<Subject[]>("/api/v1/school/subjects")
      .then((r) => setSubjects(r.data.filter((s) => s.is_active)))
      .catch(() => setSubjects([]));
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/groups`, {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
      });
      setCreating(false);
      setForm({ name: "", code: "", description: "" });
      setSaved("Group created.");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const addSubject = async () => {
    if (!addingTo || !pick.subject_id) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/groups/${addingTo.id}/subjects`, {
        subject_id: Number(pick.subject_id),
        is_elective: pick.is_elective,
      });
      setAddingTo(null);
      setPick({ subject_id: "", is_elective: false });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeSubject = async (group: Group, subjectId: number) => {
    setError(null);
    try {
      await api.delete(`${base}/groups/${group.id}/subjects/${subjectId}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const removeGroup = async (group: Group) => {
    if (
      !window.confirm(
        `Remove the group ${group.name}? The subjects in it are not affected.`
      )
    )
      return;
    setError(null);
    try {
      await api.delete(`${base}/groups/${group.id}`);
      setSaved(`${group.name} removed. Its subjects are untouched.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const grouped = groups.reduce((n, g) => n + g.subject_count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subject groups"
        subtitle="Subjects a school talks about together — a science block, a choice of languages."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New group
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Groups" value={groups.length} />
        <StatCard label="Subjects available" value={subjects.length} />
        <StatCard label="Placed in a group" value={grouped} />
        <StatCard
          label="Offered as a choice"
          value={groups.reduce((n, g) => n + g.elective_count, 0)}
          accent="neutral"
        />
      </div>

      {groups.length === 0 && (
        <Card>
          <CardBody className="text-[13px] text-ink-subtle">
            No groups yet. A group is a way of talking about subjects — it changes
            nothing about the subjects themselves.
          </CardBody>
        </Card>
      )}

      {groups.map((g) => (
        <Card key={g.id}>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>{g.name}</CardTitle>
              <p className="mt-1 text-[13px] text-ink-muted">
                <span className="font-mono">{g.code}</span>
                {g.description ? ` · ${g.description}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {!g.is_active && <Badge tone="neutral">Retired</Badge>}
              <Button variant="secondary" onClick={() => setAddingTo(g)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add a subject
              </Button>
              <Button
                variant="secondary"
                aria-label={`Remove ${g.name}`}
                onClick={() => removeGroup(g)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["Subject", "Code", "Taken", ""]}
              empty={g.subjects.length === 0 && "Nothing in this group yet."}
            >
              {g.subjects.map((m) => (
                <tr key={m.member_id}>
                  <td className={tdStrong}>{m.subject_name}</td>
                  <td className={td}>
                    <span className="font-mono text-[12px]">{m.subject_code}</span>
                  </td>
                  <td className={td}>
                    {m.is_elective ? (
                      <Badge tone="amber">Chosen from the group</Badge>
                    ) : (
                      <Badge tone="neutral">Taken with the rest</Badge>
                    )}
                  </td>
                  <td className={td}>
                    <Button
                      variant="secondary"
                      aria-label={`Take ${m.subject_name} out of ${g.name}`}
                      onClick={() => removeSubject(g, m.subject_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      ))}

      <Modal open={creating} onClose={() => setCreating(false)} title="New subject group">
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            placeholder="Sciences"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Code"
            value={form.code}
            placeholder="SCI"
            hint="Short, and unique within the school."
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy} disabled={!form.name || !form.code}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={addingTo !== null}
        onClose={() => setAddingTo(null)}
        title={addingTo ? `Add a subject to ${addingTo.name}` : ""}
      >
        <div className="space-y-4">
          <Select
            label="Subject"
            value={pick.subject_id}
            onChange={(e) => setPick({ ...pick, subject_id: e.target.value })}
          >
            <option value="">Select…</option>
            {subjects
              .filter((s) => !addingTo?.subjects.some((m) => m.subject_id === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
          </Select>
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={pick.is_elective}
              onChange={(e) => setPick({ ...pick, is_elective: e.target.checked })}
            />
            A child picks this one from the group, rather than taking it with the rest
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddingTo(null)}>
              Cancel
            </Button>
            <Button onClick={addSubject} loading={busy} disabled={!pick.subject_id}>
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
