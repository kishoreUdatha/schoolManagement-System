"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, Textarea, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Criterion = { id: number; title: string; description: string | null; max_points: number; sequence: number };
type Rubric = {
  id: number;
  name: string;
  description: string | null;
  subject_id: number | null;
  subject_name: string | null;
  created_by_name: string | null;
  is_active: boolean;
  in_use: boolean;
  max_total: number;
  criteria: Criterion[];
};
type Subject = { id: number; name: string };

const base = "/api/v1/school/rubrics";
const blank = { name: "", description: "", subject_id: "" };
const blankCriterion = { title: "", description: "", max_points: "10" };

/** Marking schemes a teacher can attach to homework: criteria with points, so
 *  a piece of work gets a mark per criterion instead of a bare approve/reject. */
export function Rubrics() {
  const [items, setItems] = useState<Rubric[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [form, setForm] = useState<(typeof blank & { id: number | null }) | null>(null);
  const [critFor, setCritFor] = useState<Rubric | null>(null);
  const [crit, setCrit] = useState<typeof blankCriterion & { id: number | null }>({ ...blankCriterion, id: null });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<Rubric[]>(base, { params: { include_inactive: includeInactive } })
      .then((r) => {
        setItems(r.data);
        setCritFor((cur) => (cur ? r.data.find((x) => x.id === cur.id) ?? null : null));
      })
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  useEffect(() => {
    api
      .get<Subject[]>("/api/v1/school/subjects")
      .then((r) => setSubjects(r.data))
      .catch(() => setSubjects([]));
  }, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setError(null);
      setNotice(done);
      await load();
      return true;
    } catch (e) {
      setNotice(null);
      setError(apiError(e));
      return false;
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const body = {
      name: form.name,
      description: form.description || null,
      subject_id: form.subject_id ? Number(form.subject_id) : null,
    };
    const ok = await run(
      () => (form.id ? api.patch(`${base}/${form.id}`, body) : api.post(base, { ...body, criteria: [] })),
      form.id ? "Rubric updated." : "Rubric created — now add its criteria."
    );
    if (ok) setForm(null);
  }

  async function saveCriterion(e: FormEvent) {
    e.preventDefault();
    if (!critFor) return;
    const body = { title: crit.title, description: crit.description || null, max_points: Number(crit.max_points) };
    const ok = await run(
      () => (crit.id ? api.put(`${base}/criteria/${crit.id}`, body) : api.post(`${base}/${critFor.id}/criteria`, body)),
      crit.id ? "Criterion updated." : "Criterion added."
    );
    if (ok) setCrit({ ...blankCriterion, id: null });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marking rubrics"
        subtitle="The criteria a piece of work is judged on. Attach one to homework and mark each criterion."
        actions={<Button onClick={() => setForm({ ...blank, id: null })}>New rubric</Button>}
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
        Show retired rubrics
      </label>

      <Card>
        <CardHeader>
          <CardTitle>Rubrics</CardTitle>
        </CardHeader>
        <CardBody>
          <Table
            head={["Name", "Subject", "Criteria", "Out of", "Written by", ""]}
            empty={items.length === 0 && "No rubrics yet."}
          >
            {items.map((r) => (
              <tr key={r.id} className={r.is_active ? undefined : "opacity-60"}>
                <td className={tdStrong}>
                  {r.name}
                  {!r.is_active && <Badge tone="neutral">Retired</Badge>}
                  {r.in_use && <Badge tone="brand">In use</Badge>}
                  {r.description && <span className="block text-xs text-ink-subtle">{r.description}</span>}
                </td>
                <td className={td}>{r.subject_name ?? "Any"}</td>
                <td className={td}>
                  {r.criteria.length === 0 ? (
                    <span className="text-warning">None yet</span>
                  ) : (
                    r.criteria.map((c) => c.title).join(", ")
                  )}
                </td>
                <td className={td}>{r.max_total}</td>
                <td className={td}>{r.created_by_name ?? "—"}</td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCritFor(r);
                        setCrit({ ...blankCriterion, id: null });
                      }}
                    >
                      Criteria
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setForm({
                          id: r.id,
                          name: r.name,
                          description: r.description ?? "",
                          subject_id: r.subject_id ? String(r.subject_id) : "",
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(
                          () => api.patch(`${base}/${r.id}`, { is_active: !r.is_active }),
                          r.is_active ? `${r.name} retired.` : `${r.name} back in use.`
                        )
                      }
                    >
                      {r.is_active ? "Retire" : "Restore"}
                    </Button>
                    {!r.in_use && (
                      <Button size="sm" variant="ghost" onClick={() => run(() => api.delete(`${base}/${r.id}`), `${r.name} deleted.`)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Edit rubric" : "New rubric"}>
        {form && (
          <form className="space-y-3" onSubmit={save}>
            <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Subject" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
              <option value="">Any subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Textarea
              label="What it is for"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={critFor !== null} onClose={() => setCritFor(null)} title={`Criteria — ${critFor?.name ?? ""}`} size="lg">
        {critFor && (
          <div className="space-y-4">
            <Table head={["Criterion", "Out of", ""]} empty={critFor.criteria.length === 0 && "Add the first criterion below."}>
              {critFor.criteria.map((c) => (
                <tr key={c.id}>
                  <td className={tdStrong}>
                    {c.title}
                    {c.description && <span className="block text-xs text-ink-subtle">{c.description}</span>}
                  </td>
                  <td className={td}>{c.max_points}</td>
                  <td className={td}>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setCrit({
                            id: c.id,
                            title: c.title,
                            description: c.description ?? "",
                            max_points: String(c.max_points),
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => run(() => api.delete(`${base}/criteria/${c.id}`), `${c.title} removed.`)}
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <p className="text-xs text-ink-subtle">
              Total: {critFor.max_total}. Criteria can be changed until work has been marked against them.
            </p>
            <form className="space-y-3 border-t border-surface-border pt-4" onSubmit={saveCriterion}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Criterion"
                  required
                  className="sm:col-span-2"
                  value={crit.title}
                  onChange={(e) => setCrit({ ...crit, title: e.target.value })}
                />
                <Input
                  label="Out of"
                  type="number"
                  min={0.5}
                  step="0.5"
                  required
                  value={crit.max_points}
                  onChange={(e) => setCrit({ ...crit, max_points: e.target.value })}
                />
              </div>
              <Textarea
                label="What earns full marks"
                value={crit.description}
                onChange={(e) => setCrit({ ...crit, description: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                {crit.id && (
                  <Button type="button" variant="secondary" onClick={() => setCrit({ ...blankCriterion, id: null })}>
                    Cancel edit
                  </Button>
                )}
                <Button type="submit">{crit.id ? "Save criterion" : "Add criterion"}</Button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}
