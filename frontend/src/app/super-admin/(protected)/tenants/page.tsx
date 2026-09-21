"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Building2, CheckCircle2, CircleSlash, Layers } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  FilterBar,
  PanelFooter,
  PersonCell,
  SearchBox,
  StatStrip,
} from "@/components/ui/Workspace";
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

  const onPage = data?.items ?? [];
  const activeOnPage = onPage.filter((t) => t.status === "active").length;
  const suspendedOnPage = onPage.filter((t) => t.status === "suspended").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        subtitle="One tenant = one school account."
        actions={<Button onClick={() => setOpenCreate(true)}>+ New tenant</Button>}
      />

      {/* The total the list endpoint counted, and the make-up of the page it
          returned — no figure here needs a request of its own. */}
      <StatStrip
        stats={[
          {
            label: "Tenants",
            value: data ? data.total.toLocaleString("en-IN") : "—",
            note: data ? `Page ${data.page} of ${data.pages}` : undefined,
            icon: Building2,
          },
          { label: "On this page", value: data ? onPage.length : "—", icon: Layers },
          {
            label: "Active",
            value: data ? activeOnPage : "—",
            note: "on this page",
            icon: CheckCircle2,
          },
          {
            label: "Suspended",
            value: data ? suspendedOnPage : "—",
            note: "on this page",
            icon: CircleSlash,
          },
        ]}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
      >
        <FilterBar>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by name, code, or contact email"
            label="Search tenants"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </FilterBar>
      </form>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>All tenants</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {search ? `Matching “${search}”` : "Every school account on the platform"}
            </p>
          </div>
        </CardHeader>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Code</th>
              <th className="px-4 py-3 font-bold">Contact</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {data?.items.map((t) => (
              <tr key={t.id} className="hover:bg-surface-subtle">
                <td className="px-4 py-3">
                  <PersonCell name={t.name} sub={t.contact_email} />
                </td>
                <td className="px-4 py-3 text-ink-muted">{t.code}</td>
                <td className="px-4 py-3 text-ink-muted">
                  <div>{t.contact_email}</div>
                  <div className="text-xs text-ink-muted">{t.contact_mobile}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-muted">
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
                <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                  No tenants yet — click <strong>New tenant</strong> to add the first school.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {data && (
          <PanelFooter
            left={`Showing ${data.items.length} of ${data.total.toLocaleString("en-IN")} tenants`}
            right={
              data.pages > 1 ? (
                <span className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </Button>
                  <span className="text-[11px] font-bold text-ink-muted">
                    Page {data.page} of {data.pages}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page >= data.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </Button>
                </span>
              ) : (
                "All records on this page"
              )
            }
          />
        )}
      </Card>

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
          <div className="rounded-lg border border-success/30 bg-success-bg p-4 text-sm text-success">
            <div className="font-medium">Tenant created successfully.</div>
            <div className="mt-2">
              Share these credentials with the school admin <strong>once</strong> — the
              password is not stored in plain text and cannot be retrieved later.
            </div>
            <div className="mt-3 rounded bg-surface-raised px-3 py-2 text-[12px] tabular-nums">
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

          <div className="border-t border-surface-border pt-4">
            <h4 className="text-sm font-semibold text-ink-muted">First school admin</h4>
            <p className="text-xs text-ink-muted">
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
            <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
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
