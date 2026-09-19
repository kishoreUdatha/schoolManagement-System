"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Textarea, humanize } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Template = {
  id: number;
  kind: string;
  name: string;
  title: string;
  body: string;
  serial_prefix: string;
  parent_can_request: boolean;
  is_active: boolean;
};

const KINDS = ["bonafide", "study", "character", "transfer", "fee_paid", "custom"];

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [placeholders, setPlaceholders] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const [t, p] = await Promise.all([
        api.get<Template[]>("/api/v1/school/certificates/templates"),
        api.get<Record<string, string>>("/api/v1/school/certificates/placeholders"),
      ]);
      setItems(t.data);
      setPlaceholders(p.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <Link href="/school/certificates" className="text-sm text-ink-muted hover:underline">
        ← Certificates
      </Link>
      <PageHeader
        title="Certificate templates"
        subtitle="Edit the wording. Changes apply to new certificates only; issued ones keep their text."
        actions={<Button onClick={() => setCreating(true)}>+ New template</Button>}
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle>
                {t.name} {!t.is_active && <Badge>inactive</Badge>}
              </CardTitle>
              <Button size="sm" variant="secondary" onClick={() => setEditing(t)}>
                Edit
              </Button>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <div className="text-xs text-ink-subtle">
                {humanize(t.kind)} · serial {t.serial_prefix}/YYYY/nnnn
                {t.parent_can_request && " · parents can request online"}
              </div>
              <p className="line-clamp-4 whitespace-pre-wrap text-ink-muted">{t.body}</p>
            </CardBody>
          </Card>
        ))}
      </div>
      {(creating || editing) && (
        <TemplateModal
          existing={editing}
          placeholders={placeholders}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            setNotice("Template saved.");
            load();
          }}
        />
      )}
    </div>
  );
}

function TemplateModal({
  existing,
  placeholders,
  onClose,
  onSaved,
}: {
  existing: Template | null;
  placeholders: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    kind: existing?.kind ?? "custom",
    name: existing?.name ?? "",
    title: existing?.title ?? "",
    body: existing?.body ?? "",
    serial_prefix: existing?.serial_prefix ?? "",
    parent_can_request: existing?.parent_can_request ?? false,
    is_active: existing?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        const { kind: _kind, ...rest } = form;
        await api.patch(`/api/v1/school/certificates/templates/${existing.id}`, rest);
      } else {
        const { is_active: _active, ...rest } = form;
        await api.post("/api/v1/school/certificates/templates", rest);
      }
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={existing ? `Edit ${existing.name}` : "New template"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} disabled={!!existing}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
          <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input
            label="Serial prefix *"
            placeholder="BON"
            value={form.serial_prefix}
            onChange={(e) => setForm({ ...form, serial_prefix: e.target.value })}
            required
          />
        </div>
        <Input label="Heading on the certificate *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <Textarea
          label="Text * (blank line = new paragraph)"
          rows={9}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          required
        />
        <details className="text-xs text-ink-muted">
          <summary className="cursor-pointer">Placeholders you can use</summary>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {Object.entries(placeholders).map(([k, v]) => (
              <button
                type="button"
                key={k}
                className="text-left hover:text-ink"
                onClick={() => setForm({ ...form, body: `${form.body}{${k}}` })}
              >
                <code className="text-ink">{`{${k}}`}</code> — {v}
              </button>
            ))}
          </div>
        </details>
        <div className="flex flex-wrap gap-4 text-sm text-ink-muted">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.parent_can_request}
              onChange={(e) => setForm({ ...form, parent_can_request: e.target.checked })}
            />
            Parents can request this online
          </label>
          {existing && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active
            </label>
          )}
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
