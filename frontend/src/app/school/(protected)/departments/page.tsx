"use client";

import { BookOpen, Building2, UserCheck, Users } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Select, Table, fieldClass, td, tdStrong } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { FormGrid, PanelFooter, Req, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

/** The mock's `.field` with its rose asterisk. Input and Select take a
 *  plain-string label, so a required field is spelt out here rather than
 *  having the requirement smuggled into the text as " *". */
function ReqField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-bold text-ink-muted">
        {label}
        <Req />
      </span>
      {children}
    </label>
  );
}

type Dept = { id: number; name: string; code: string; head_user_id: number | null; head_name: string | null; is_active: boolean; staff_count: number; subject_count: number };

export default function DepartmentsPage() {
  const [items, setItems] = useState<Dept[]>([]);
  const [editing, setEditing] = useState<Dept | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api
      .get<Dept[]>("/api/v1/school/departments")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        subtitle="Group staff and subjects (Science, Languages, Administration…). Set a department on each staff member and subject."
        actions={<Button onClick={() => setEditing("new")}>+ New department</Button>}
      />
      <ErrorBox>{error}</ErrorBox>

      {/* Counted from the rows already loaded — the list endpoint returns
          staff_count and subject_count per department, so the summary is a
          sum of what is on screen rather than a second set of queries. */}
      <StatStrip
        stats={[
          {
            label: "Departments",
            value: items.length || "—",
            note: `${items.filter((d) => d.is_active).length} active`,
            icon: Building2,
          },
          {
            label: "Staff grouped",
            value: items.reduce((n, d) => n + d.staff_count, 0) || "—",
            note: "Across every department",
            icon: Users,
          },
          {
            label: "Subjects grouped",
            value: items.reduce((n, d) => n + d.subject_count, 0) || "—",
            note: "Across every department",
            icon: BookOpen,
          },
          {
            label: "Heads named",
            value: items.filter((d) => d.head_name).length || "—",
            note: items.length ? `of ${items.length} departments` : undefined,
            icon: UserCheck,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>All departments</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Every staff member and subject belongs to one of these.
            </p>
          </div>
        </CardHeader>
        <Table head={["Department", "Code", "Head", "Staff", "Subjects", ""]} empty={items.length === 0 && "No departments yet."}>
          {items.map((d) => (
            <tr key={d.id}>
              <td className={tdStrong}>
                {d.name} {!d.is_active && <Badge>inactive</Badge>}
              </td>
              <td className={td}>{d.code}</td>
              <td className={td}>{d.head_name ?? "—"}</td>
              <td className={td}>{d.staff_count}</td>
              <td className={td}>{d.subject_count}</td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`Showing ${items.length} department(s)`}
          right={
            items.length
              ? `${items.filter((d) => d.is_active).length} active · ${items.filter((d) => !d.is_active).length} inactive`
              : undefined
          }
        />
      </Card>
      {editing && (
        <DeptModal
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DeptModal({ existing, onClose, onSaved }: { existing: Dept | null; onClose: () => void; onSaved: () => void }) {
  const [staff, setStaff] = useState<{ user_id: number; full_name: string }[]>([]);
  const [f, setF] = useState({
    name: existing?.name ?? "",
    code: existing?.code ?? "",
    head_user_id: existing?.head_user_id ? String(existing.head_user_id) : "",
    is_active: existing?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ user_id: number; full_name: string }[]>("/api/v1/school/directory/staff").then((r) => setStaff(r.data)).catch(() => undefined);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { ...f, head_user_id: f.head_user_id ? Number(f.head_user_id) : null };
    try {
      if (existing) await api.put(`/api/v1/school/departments/${existing.id}`, payload);
      else await api.post("/api/v1/school/departments", payload);
      onSaved();
    } catch (err) {
      setError(apiError(err));
    }
  }
  return (
    <Modal open onClose={onClose} title={existing ? `Edit ${existing.name}` : "New department"}>
      <form onSubmit={submit} className="space-y-4">
        {/* Three fields and a switch — too few to number into sections, so
            the mock's grid alone. */}
        <FormGrid>
          <ReqField label="Name">
            <input
              className={fieldClass}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              required
            />
          </ReqField>
          <ReqField label="Code">
            <input
              className={fieldClass}
              placeholder="SCI"
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
              required
            />
          </ReqField>
          <Select label="Head of department" value={f.head_user_id} onChange={(e) => setF({ ...f, head_user_id: e.target.value })}>
            <option value="">None</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name}
              </option>
            ))}
          </Select>
        </FormGrid>
        {existing && (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            Active
          </label>
        )}
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
