"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Tenant = {
  id: number;
  name: string;
  code: string;
  contact_email: string;
  contact_mobile: string;
  contact_person: string | null;
  status: "active" | "suspended" | "deleted";
  is_active: boolean;
  created_at: string;
};

type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

const statusTone = {
  active: "emerald",
  suspended: "amber",
  deleted: "rose",
} as const;

export default function TenantsPage() {
  const [data, setData] = useState<Paginated<Tenant> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

  async function load() {
    setError(null);
    try {
      const { data } = await api.get<Paginated<Tenant>>(
        "/api/v1/super-admin/tenants",
        { params: { page, page_size: 20, search: search || undefined } }
      );
      setData(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tenants</h1>
          <p className="mt-1 text-sm text-slate-500">
            One tenant = one school account.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>+ New tenant</Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="Search by name, code, or contact email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md flex-1"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                <td className="px-4 py-3 text-slate-600">{t.code}</td>
                <td className="px-4 py-3 text-slate-600">
                  <div>{t.contact_email}</div>
                  <div className="text-xs text-slate-500">{t.contact_mobile}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/super-admin/tenants/${t.id}`}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No tenants yet — click <strong>New tenant</strong> to add the first school.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <div>
            Page {data.page} of {data.pages} ({data.total} total)
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}

      <CreateTenantModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={() => {
          setOpenCreate(false);
          setPage(1);
          load();
        }}
      />
    </div>
  );
}

function CreateTenantModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    contact_email: "",
    contact_mobile: "",
    contact_person: "",
    school_admin_name: "",
    school_admin_email: "",
    school_admin_phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPwd, setTempPwd] = useState<string | null>(null);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post("/api/v1/super-admin/tenants", form);
      setTempPwd(data.school_admin_temporary_password);
      if (!data.school_admin_temporary_password) {
        onCreated();
      }
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create new tenant" size="lg">
      {tempPwd ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="font-medium">Tenant created successfully.</div>
            <div className="mt-2">
              Share these credentials with the school admin <strong>once</strong> — the
              password is not stored in plain text and cannot be retrieved later.
            </div>
            <div className="mt-3 rounded bg-white px-3 py-2 font-mono text-xs">
              <div>Email: {form.school_admin_email}</div>
              <div>Temporary password: {tempPwd}</div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={onCreated}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="School name *"
              name="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
            <Input
              label="Contact person"
              name="contact_person"
              value={form.contact_person}
              onChange={(e) => update("contact_person", e.target.value)}
            />
            <Input
              label="Contact email *"
              type="email"
              name="contact_email"
              value={form.contact_email}
              onChange={(e) => update("contact_email", e.target.value)}
              required
            />
            <Input
              label="Contact mobile *"
              name="contact_mobile"
              value={form.contact_mobile}
              onChange={(e) => update("contact_mobile", e.target.value)}
              placeholder="+91…"
              required
            />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-700">First school admin</h4>
            <p className="text-xs text-slate-500">
              This user will be created with role <code>school_admin</code>. Password is
              auto-generated and shown once.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Admin name *"
              name="school_admin_name"
              value={form.school_admin_name}
              onChange={(e) => update("school_admin_name", e.target.value)}
              required
            />
            <Input
              label="Admin email *"
              type="email"
              name="school_admin_email"
              value={form.school_admin_email}
              onChange={(e) => update("school_admin_email", e.target.value)}
              required
            />
            <Input
              label="Admin phone"
              name="school_admin_phone"
              value={form.school_admin_phone}
              onChange={(e) => update("school_admin_phone", e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? "Creating…" : "Create tenant"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
