"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ChevronLeft, KeyRound, Link2, Unlink } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  WarnBox,
  humanize,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Relation = "father" | "mother" | "guardian" | "other";

type ChildLink = {
  student_id: number;
  full_name: string;
  admission_no: string;
  section_id: number;
  section_label: string | null;
  relation: Relation;
};

type Parent = {
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  children: ChildLink[];
};

type StudentLite = { id: number; full_name: string; admission_no: string };

/** Tabs are repeated in each of the three parent pages rather than shared.
 *  Three short copies beat a component nobody else will ever use. */
function ParentTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/school/parents/${id}`;
  const tabs = [
    { href: base, label: "Profile" },
    { href: `${base}/payments`, label: "Payments" },
    { href: `${base}/activity`, label: "Activity" },
  ];
  return (
    <nav className="flex flex-wrap gap-1 border-b border-surface-border">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={
            pathname === t.href
              ? "border-b-2 border-brand-600 px-3 py-2 text-[13px] font-extrabold text-brand-600"
              : "border-b-2 border-transparent px-3 py-2 text-[13px] font-bold text-ink-muted hover:text-ink"
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export default function ParentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [parent, setParent] = useState<Parent | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [link, setLink] = useState<{ student_id: number | ""; relation: Relation }>({
    student_id: "",
    relation: "guardian",
  });

  const load = () =>
    api
      .get<Parent>(`/api/v1/school/parents/${id}`)
      .then((r) => {
        setParent(r.data);
        setForm({ full_name: r.data.full_name, phone: r.data.phone ?? "" });
      })
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<{ items: StudentLite[] }>("/api/v1/school/students?page_size=200")
      .then((r) => setStudents(r.data.items))
      .catch(() => setStudents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const act = async (fn: () => Promise<unknown>, said: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(said);
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    await act(
      () => api.patch(`/api/v1/school/parents/${id}`, form),
      "Details saved.",
    );
    setEditing(false);
  };

  const resetPassword = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.post<{ user_id: number; temporary_password: string }>(
        `/api/v1/school/parents/${id}/reset-password`,
      );
      setTempPassword(r.data.temporary_password);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const addLink = async (e: FormEvent) => {
    e.preventDefault();
    if (link.student_id === "") return;
    await act(
      () =>
        api.post(`/api/v1/school/parents/${id}/links`, {
          student_id: link.student_id,
          relation: link.relation,
        }),
      "Child linked.",
    );
    setLinking(false);
    setLink({ student_id: "", relation: "guardian" });
  };

  const removeLink = (child: ChildLink) =>
    act(
      () => api.delete(`/api/v1/school/parents/${id}/links/${child.student_id}`),
      `${child.full_name} unlinked.`,
    );

  // Already-linked children are not offered again; the API would reject it and
  // the office would have to work out why from an error.
  const linkedIds = new Set((parent?.children ?? []).map((c) => c.student_id));
  const linkable = students.filter((s) => !linkedIds.has(s.id));

  return (
    <div className="space-y-6">
      <Link
        href="/school/parents"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All parents
      </Link>

      <PageHeader
        title={parent?.full_name ?? "Parent"}
        subtitle="One login, and the children it can see."
        actions={
          parent && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="secondary" loading={busy} onClick={resetPassword}>
                <KeyRound className="mr-1.5 h-4 w-4" />
                Reset password
              </Button>
              {parent.is_active ? (
                <Button
                  variant="secondary"
                  loading={busy}
                  onClick={() =>
                    act(
                      () => api.post(`/api/v1/school/parents/${id}/deactivate`),
                      `${parent.full_name} can no longer sign in.`,
                    )
                  }
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  loading={busy}
                  onClick={() =>
                    act(
                      () => api.post(`/api/v1/school/parents/${id}/activate`),
                      `${parent.full_name} can sign in again.`,
                    )
                  }
                >
                  Activate
                </Button>
              )}
            </div>
          )
        }
      />

      <ParentTabs id={id} />

      <ErrorBox>{error}</ErrorBox>
      {notice && <NoticeBox>{notice}</NoticeBox>}

      {tempPassword && (
        <WarnBox>
          New password:{" "}
          <span className="font-mono text-[14px] font-bold">{tempPassword}</span>. It is
          shown once and cannot be looked up again — hand it over or write it down now.
          If it is lost, reset it again rather than searching for it.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          {parent &&
            (parent.is_active ? (
              <Badge tone="emerald">Active</Badge>
            ) : (
              <Badge tone="rose">Cannot sign in</Badge>
            ))}
        </CardHeader>
        <CardBody>
          {!parent ? (
            <p className="text-[13px] text-ink-subtle">Loading…</p>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Email", parent.email ?? "—"],
                ["Phone", parent.phone ?? "Not recorded"],
                [
                  "Last signed in",
                  parent.last_login_at ? dateTime(parent.last_login_at) : "Never",
                ],
                ["Children linked", String(parent.children.length)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[12px] font-bold text-ink-muted">{label}</dt>
                  <dd className="mt-0.5 text-[14px] font-bold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Children</CardTitle>
          <Button variant="secondary" onClick={() => setLinking(true)}>
            <Link2 className="mr-1.5 h-4 w-4" />
            Link a child
          </Button>
        </CardHeader>
        <CardBody>
          {parent && parent.children.length === 0 && (
            <p className="text-[13px] text-ink-subtle">
              No children linked yet — this login would see nothing.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {(parent?.children ?? []).map((c) => (
              <Card key={c.student_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/school/students/${c.student_id}`}
                      className="text-[15px] font-extrabold text-ink hover:text-brand-600 hover:underline"
                    >
                      {c.full_name}
                    </Link>
                    <p className="mt-0.5 text-[12px] text-ink-subtle">
                      {c.admission_no}
                      {c.section_label ? ` · ${c.section_label}` : ""}
                    </p>
                    <Badge tone="brand" className="mt-2">
                      {humanize(c.relation)}
                    </Badge>
                  </div>
                  <Button
                    variant="secondary"
                    aria-label={`Unlink ${c.full_name}`}
                    onClick={() => removeLink(c)}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </CardBody>
      </Card>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit details">
        <form onSubmit={save} className="space-y-4">
          <Input
            label="Full name"
            name="full_name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
          <Input
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          {/* The email is the login itself, so it is not editable here — changing
              it would silently move somebody's account to a new address. */}
          <p className="text-[12px] text-ink-subtle">
            The email address is this parent&apos;s login and cannot be changed here.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={linking} onClose={() => setLinking(false)} title="Link a child">
        <form onSubmit={addLink} className="space-y-4">
          <Select
            label="Child"
            value={link.student_id}
            onChange={(e) =>
              setLink({
                ...link,
                student_id: e.target.value ? Number(e.target.value) : "",
              })
            }
            required
          >
            <option value="">Choose a child…</option>
            {linkable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.admission_no})
              </option>
            ))}
          </Select>
          <Select
            label="Relation"
            value={link.relation}
            onChange={(e) => setLink({ ...link, relation: e.target.value as Relation })}
          >
            <option value="father">Father</option>
            <option value="mother">Mother</option>
            <option value="guardian">Guardian</option>
            <option value="other">Other</option>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setLinking(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={link.student_id === ""}>
              Link
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
