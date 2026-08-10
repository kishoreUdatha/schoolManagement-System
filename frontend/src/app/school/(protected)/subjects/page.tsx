"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type SubjectKind = "core" | "elective";

type Subject = {
  id: number;
  name: string;
  code: string;
  kind: SubjectKind;
  display_order: number;
  is_active: boolean;
};

type BulkResult = {
  created: Subject[];
  errors: { row: number; name?: string; code?: string; error: string }[];
};

const kindTone = { core: "brand", elective: "neutral" } as const;

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Subject[]>(
        "/api/v1/school/subjects?active_only=false"
      );
      setSubjects(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(s: Subject) {
    if (!window.confirm(`Delete subject "${s.name}"?`)) return;
    try {
      await api.delete(`/api/v1/school/subjects/${s.id}`);
      setNotice(`Deleted ${s.name}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subjects</h1>
          <p className="mt-1 text-sm text-slate-500">
            School-wide subject master. Each subject can be assigned to multiple
            classes from the <strong>Classes</strong> page.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setOpenBulk(true)}>
            Bulk import (CSV)
          </Button>
          <Button onClick={() => setOpenCreate(true)}>+ New subject</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">Order</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subjects.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-700">{s.code}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                <td className="px-4 py-3">
                  <Badge tone={kindTone[s.kind]}>{s.kind}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">{s.display_order}</td>
                <td className="px-4 py-3">
                  {s.is_active ? (
                    <Badge tone="emerald">active</Badge>
                  ) : (
                    <Badge tone="neutral">inactive</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(s)}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(s)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {subjects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No subjects yet — add one or paste a CSV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <SubjectFormModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSaved={(name) => {
          setOpenCreate(false);
          setNotice(`Created ${name}.`);
          load();
        }}
      />
      {editing && (
        <SubjectFormModal
          open
          subject={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setNotice(`Updated ${name}.`);
            load();
          }}
        />
      )}
      <BulkImportModal
        open={openBulk}
        onClose={() => setOpenBulk(false)}
        onDone={(r) => {
          if (r.created.length > 0) {
            setNotice(
              `Imported ${r.created.length} subject(s)${
                r.errors.length ? `; skipped ${r.errors.length} duplicate(s).` : "."
              }`
            );
          }
          load();
        }}
      />
    </div>
  );
}

function SubjectFormModal({
  open,
  subject,
  onClose,
  onSaved,
}: {
  open: boolean;
  subject?: Subject;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const editing = !!subject;
  const [name, setName] = useState(subject?.name ?? "");
  const [code, setCode] = useState(subject?.code ?? "");
  const [kind, setKind] = useState<SubjectKind>(subject?.kind ?? "core");
  const [order, setOrder] = useState(subject?.display_order ?? 0);
  const [active, setActive] = useState(subject?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subject) {
      setName(subject.name);
      setCode(subject.code);
      setKind(subject.kind);
      setOrder(subject.display_order);
      setActive(subject.is_active);
    } else {
      setName("");
      setCode("");
      setKind("core");
      setOrder(0);
      setActive(true);
    }
  }, [subject]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editing && subject) {
        await api.patch(`/api/v1/school/subjects/${subject.id}`, {
          name,
          code,
          kind,
          display_order: order,
          is_active: active,
        });
      } else {
        await api.post("/api/v1/school/subjects", {
          name,
          code,
          kind,
          display_order: order,
        });
      }
      onSaved(name);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${subject?.name}` : "New subject"}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Code *"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. MATH"
            required
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Kind *</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as SubjectKind)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
            >
              <option value="core">Core</option>
              <option value="elective">Elective</option>
            </select>
          </label>
          <Input
            label="Display order"
            type="number"
            min="0"
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
          />
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-slate-300"
            />
            Active
          </label>
        )}
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {editing ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BulkImportModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (r: BulkResult) => void;
}) {
  const [csv, setCsv] = useState(
    "name,code,kind\nMathematics,MATH,core\nEnglish,ENG,core\nComputer Science,CS,elective"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  function parseCsv(text: string) {
    const rows = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (rows.length < 2) {
      throw new Error("CSV must have a header plus at least one row");
    }
    const header = rows[0].split(",").map((c) => c.trim().toLowerCase());
    const nameIdx = header.indexOf("name");
    const codeIdx = header.indexOf("code");
    const kindIdx = header.indexOf("kind");
    if (nameIdx < 0 || codeIdx < 0) {
      throw new Error("CSV header must include 'name' and 'code' columns");
    }
    return rows.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const k = (cells[kindIdx] || "core").toLowerCase();
      return {
        name: cells[nameIdx],
        code: cells[codeIdx],
        kind: k === "elective" ? "elective" : "core",
      };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    let parsed;
    try {
      parsed = parseCsv(csv);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (parsed.length === 0) {
      setError("No data rows found");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<BulkResult>(
        "/api/v1/school/subjects/bulk",
        { subjects: parsed }
      );
      setResult(data);
      onDone(data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk import subjects" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">
            Paste CSV (with header)
          </label>
          <textarea
            className="mt-1 h-48 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Columns: <code>name,code,kind</code>. Kind is <code>core</code> or{" "}
            <code>elective</code> (defaults to core).
          </p>
        </div>
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs">
            <div>
              Imported <strong>{result.created.length}</strong> · skipped{" "}
              <strong>{result.errors.length}</strong> duplicate(s)
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-rose-700">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row + 1}: {e.name} ({e.code}) — {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" loading={submitting}>
            Import
          </Button>
        </div>
      </form>
    </Modal>
  );
}
