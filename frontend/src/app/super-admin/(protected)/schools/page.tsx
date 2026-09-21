"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Building2, GraduationCap, Layers, Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  Textarea,
  humanize,
  td,
} from "@/components/ui/Field";
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
import { dateTime } from "@/lib/dates";

/** A select sized for the filter bar: the same height as the search box. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type School = {
  id: number;
  tenant_id: number;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  currency: string;
  status: string;
  is_active: boolean;
  created_at: string;
};
type Tenant = {
  id: number;
  name: string;
  code: string;
  logo_url: string | null;
  address: string | null;
  contact_person: string | null;
  contact_email: string;
  contact_mobile: string;
  status: string;
  is_active: boolean;
  created_at: string;
};
type TenantDetail = Tenant & { schools: School[] };
type Paginated<T> = { items: T[]; total: number; page: number; page_size: number; pages: number };

type Row = { tenant: Tenant; school: School | null };

const tone = (s: string) =>
  s === "active" ? "emerald" : s === "suspended" ? "amber" : s === "deleted" ? "rose" : "neutral";

/** Every school on the platform, rather than every account that owns one.
 *
 *  Schools hang off tenants, and the list endpoint only returns tenants — so
 *  each tenant on the page is opened once to read its schools. That is a
 *  request per row, which is fine for a page of twenty and would want a
 *  schools endpoint of its own before it is thousands.
 */
export default function PlatformSchoolsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    contact_person: "",
    contact_email: "",
    contact_mobile: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Paginated<Tenant>>("/api/v1/super-admin/tenants", {
        params: {
          page,
          page_size: 20,
          search: search || undefined,
          status: status || undefined,
        },
      });
      setTotal(data.total);
      const out: Row[] = [];
      for (const t of data.items) {
        try {
          const detail = await api.get<TenantDetail>(`/api/v1/super-admin/tenants/${t.id}`);
          const schools = detail.data.schools ?? [];
          if (schools.length === 0) out.push({ tenant: t, school: null });
          for (const s of schools) out.push({ tenant: t, school: s });
        } catch {
          out.push({ tenant: t, school: null });
        }
      }
      setRows(out);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  const openEdit = (t: Tenant) => {
    setEditing(t);
    setForm({
      name: t.name || "",
      address: t.address || "",
      contact_person: t.contact_person || "",
      contact_email: t.contact_email || "",
      contact_mobile: t.contact_mobile || "",
    });
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.patch(`/api/v1/super-admin/tenants/${editing.id}`, {
        name: form.name,
        address: form.address || null,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email,
        contact_mobile: form.contact_mobile,
      });
      setDone(`${form.name} updated.`);
      setEditing(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const schools = rows.filter((r) => r.school).length;
  const tenants = new Set(rows.map((r) => r.tenant.id)).size;
  const noSchool = rows.filter((r) => !r.school).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schools"
        subtitle="Every school on the platform, and the organisation that owns it."
        actions={
          <Link href="/super-admin/schools/new">
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              New school
            </Button>
          </Link>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      {/* Counted from the rows already on screen and the total the list
          endpoint returned with them — nothing here costs a request. */}
      <StatStrip
        stats={[
          { label: "Organisations on this page", value: tenants, icon: Building2 },
          { label: "Schools on this page", value: schools, icon: GraduationCap },
          {
            label: "Organisations with no school",
            value: noSchool,
            icon: AlertTriangle,
          },
          {
            label: "Organisations in total",
            value: total,
            note: `Page ${page}`,
            icon: Layers,
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
            placeholder="Name, code or email"
            label="Search organisations"
          />
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={filterSelect}
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </FilterBar>
      </form>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Schools</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {[status ? humanize(status) : "Any status", search ? `“${search}”` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </CardHeader>
        <Table
          head={["School", "Code", "Organisation", "Contact", "Status", "Added", ""]}
          empty={!loading && rows.length === 0 && "No organisations match that search."}
        >
            {rows.map((r) => (
              <tr key={`${r.tenant.id}-${r.school?.id ?? "none"}`}>
                <td className="px-4 py-3">
                  {r.school ? (
                    <PersonCell name={r.school.name} sub={r.school.address} />
                  ) : (
                    <span className="text-[12px] text-ink-subtle">No school set up yet</span>
                  )}
                </td>
                <td className={td}>{r.school?.code ?? "—"}</td>
                <td className={td}>
                  <Link
                    href={`/super-admin/tenants/${r.tenant.id}`}
                    className="font-bold text-brand-600 hover:underline"
                  >
                    {r.tenant.name}
                  </Link>
                  <span className="block text-[11px] text-ink-subtle">{r.tenant.code}</span>
                </td>
                <td className={td}>
                  {r.tenant.contact_person || "—"}
                  <span className="block text-[11px] text-ink-subtle">
                    {r.tenant.contact_email}
                  </span>
                </td>
                <td className={td}>
                  <Badge tone={tone(r.school?.status ?? r.tenant.status)}>
                    {humanize(r.school?.status ?? r.tenant.status)}
                  </Badge>
                </td>
                <td className={td}>
                  {r.school ? dateTime(r.school.created_at) : dateTime(r.tenant.created_at)}
                </td>
                <td className={td}>
                  <Button
                    variant="secondary"
                    aria-label={`Edit ${r.tenant.name}`}
                    onClick={() => openEdit(r.tenant)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
        </Table>
        <PanelFooter
          left={
            loading
              ? "Loading…"
              : `Showing ${rows.length} row(s) from ${tenants} of ${total} organisations`
          }
          right={
            <span className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-[11px] font-bold text-ink-muted">Page {page}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={page * 20 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </span>
          }
        />
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Organisation — ${editing.name}` : ""}
      >
        <div className="space-y-3">
          <Input
            label="Organisation name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Textarea
            label="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <Input
            label="Contact person"
            value={form.contact_person}
            onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
          />
          <Input
            label="Contact email"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
          />
          <Input
            label="Contact mobile"
            value={form.contact_mobile}
            onChange={(e) => setForm({ ...form, contact_mobile: e.target.value })}
          />
          <p className="text-[12px] text-ink-subtle">
            The organisation code cannot be changed — public admission and careers links
            are built from it.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={form.name.trim().length < 2}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
