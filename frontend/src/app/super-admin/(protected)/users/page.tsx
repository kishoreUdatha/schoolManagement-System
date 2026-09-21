"use client";

import { useEffect, useState } from "react";
import { CircleSlash, Clock, Copy, KeyRound, ShieldCheck, Users, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  td,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, PersonCell, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Row = {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  must_change_password: boolean;
  is_last_active: boolean;
};
type Issued = { id: number; full_name?: string; email: string | null; password: string };

/** Accounts that can administer the platform itself.
 *
 *  The password appears once, when it is made. There is no endpoint that
 *  reads one back — an operator who loses the slip gets a new password, not
 *  the old one.
 */
export default function PlatformUsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Row[]>("/api/v1/super-admin/platform-users")
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Issued>("/api/v1/super-admin/platform-users", {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
      });
      setIssued(r.data);
      setAdding(false);
      setForm({ full_name: "", email: "", phone: "" });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (row: Row, is_active: boolean) => {
    setError(null);
    try {
      await api.patch(`/api/v1/super-admin/platform-users/${row.id}`, { is_active });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const reset = async (row: Row) => {
    setError(null);
    try {
      const r = await api.post<Issued>(
        `/api/v1/super-admin/platform-users/${row.id}/reset-password`
      );
      setIssued({ ...r.data, full_name: row.full_name });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const active = rows.filter((r) => r.is_active).length;
  const neverIn = rows.filter((r) => !r.last_login_at).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform administrators"
        subtitle="Who can administer the platform itself, rather than any one school."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Add an administrator
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {/* Counted from the list already loaded, not from a second endpoint. */}
      <StatStrip
        stats={[
          { label: "Accounts", value: rows.length, icon: Users },
          { label: "Active", value: active, icon: ShieldCheck },
          { label: "Switched off", value: rows.length - active, icon: CircleSlash },
          { label: "Never signed in", value: neverIn, icon: Clock },
        ]}
      />

      {active === 1 && (
        <WarnBox>
          Only one administrator can sign in. It cannot be switched off — there would
          be nobody left able to create another — but a second account is worth having
          before somebody loses a laptop.
        </WarnBox>
      )}

      {issued && (
        <Card>
          <CardHeader>
            <CardTitle>Password for {issued.full_name ?? issued.email}</CardTitle>
            <Button
              variant="secondary"
              onClick={() =>
                navigator.clipboard?.writeText(issued.password).catch(() => undefined)
              }
            >
              <Copy className="mr-1.5 h-4 w-4" />
              Copy
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            <WarnBox>
              This is shown once. Nothing stores it in a form anybody can read back, so
              once this card is dismissed the only way to help is to issue another.
            </WarnBox>
            <p className="font-mono text-[18px] font-bold text-ink">{issued.password}</p>
            <p className="text-[12px] text-ink-subtle">
              They will be asked to choose their own the first time they sign in.
            </p>
            <Button variant="secondary" onClick={() => setIssued(null)}>
              I have handed it over
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Accounts</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {active} active · {rows.length - active} switched off · {neverIn} never signed in
            </p>
          </div>
        </CardHeader>
        <Table
          head={["Name", "Email", "State", "Last signed in", ""]}
          empty={rows.length === 0 && "No administrators yet."}
        >
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <PersonCell
                    name={r.full_name}
                    sub={
                      r.must_change_password
                        ? "has not chosen their own password yet"
                        : r.email
                    }
                  />
                </td>
                <td className={td}>{r.email ?? "—"}</td>
                <td className={td}>
                  {r.is_active ? (
                    <Badge tone="emerald">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Switched off</Badge>
                  )}
                  {r.is_last_active && (
                    <Badge tone="amber" className="ml-2">
                      Last one
                    </Badge>
                  )}
                </td>
                <td className={td}>
                  {r.last_login_at ? (
                    dateTime(r.last_login_at)
                  ) : (
                    <span className="text-ink-subtle">Never</span>
                  )}
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => reset(r)}>
                      <KeyRound className="mr-1.5 h-4 w-4" />
                      New password
                    </Button>
                    {r.is_active ? (
                      <Button
                        variant="secondary"
                        disabled={r.is_last_active}
                        title={
                          r.is_last_active
                            ? "The last administrator cannot be switched off."
                            : undefined
                        }
                        onClick={() => setActive(r, false)}
                      >
                        Switch off
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => setActive(r, true)}>
                        Switch on
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
        </Table>
        <PanelFooter
          left={`${rows.length} account${rows.length === 1 ? "" : "s"}`}
          right={`${active} able to sign in`}
        />
      </Card>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a platform administrator"
      >
        <div className="space-y-4">
          <NoticeBox>
            They get full run of the platform — every school, every tenant, billing and
            these accounts.
          </NoticeBox>
          <Input
            label="Full name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            hint="This is how they sign in."
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              loading={busy}
              disabled={form.full_name.trim().length < 2 || !form.email.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
