"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Printer, UserX } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type SchoolClass = { id: number; name: string };
type Row = {
  student_id: number;
  admission_no: string;
  student_name: string;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  has_login: boolean;
  is_active: boolean;
  last_login_at: string | null;
};
type Created = {
  student_id: number;
  admission_no: string;
  student_name: string;
  user_id: number;
  password: string;
  created: boolean;
};

/** Student logins, from the office side.
 *
 *  The passwords on this screen exist only while it is open. They are not
 *  stored anywhere readable and there is no way to ask for them again — so
 *  the screen pushes hard towards printing or copying them before it is
 *  closed, and says plainly what happens if you do not.
 */
export default function StudentLoginsPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [rows, setRows] = useState<Row[]>([]);
  const [made, setMade] = useState<Created[] | null>(null);
  const [confirmClass, setConfirmClass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<SchoolClass[]>("/api/v1/school/classes")
      .then((r) => setClasses(r.data))
      .catch(() => setClasses([]));
  }, []);

  const load = (id: number | "" = classId) =>
    api
      .get<Row[]>("/api/v1/school/student-logins", {
        params: { class_id: id || undefined },
      })
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const one = async (studentId: number) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Created>(`/api/v1/school/student-logins/${studentId}`);
      setMade([r.data]);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const wholeClass = async () => {
    if (!classId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ created: Created[]; reset: Created[] }>(
        `/api/v1/school/student-logins/class/${classId}`
      );
      setMade([...r.data.created, ...r.data.reset]);
      setConfirmClass(false);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: Row) => {
    if (!window.confirm(`Switch off the login for ${row.student_name}?`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/student-logins/${row.student_id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const withLogin = rows.filter((r) => r.has_login).length;
  const active = rows.filter((r) => r.has_login && r.is_active).length;
  const never = rows.filter((r) => r.has_login && !r.last_login_at).length;

  const copyAll = () => {
    if (!made) return;
    const text = made
      .map((m) => `${m.admission_no}\t${m.student_name}\t${m.password}`)
      .join("\n");
    navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student logins"
        subtitle="Who can sign in to the student portal, and the passwords to hand over."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Select
              value={classId}
              onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")}
              aria-label="Class"
            >
              <option value="">Every class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button disabled={!classId} onClick={() => setConfirmClass(true)}>
              <KeyRound className="mr-1.5 h-4 w-4" />
              Logins for this class
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Children" value={rows.length} />
        <StatCard label="With a login" value={withLogin} />
        <StatCard
          label="Without one"
          value={rows.length - withLogin}
          accent={rows.length - withLogin ? "amber" : "emerald"}
        />
        <StatCard label="Never signed in" value={never} />
      </div>

      {made && (
        <Card>
          <CardHeader>
            <CardTitle>Passwords to hand over</CardTitle>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={copyAll}>
                <Copy className="mr-1.5 h-4 w-4" />
                Copy
              </Button>
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print
              </Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <WarnBox>
              These passwords are shown once. Nothing stores them in a form anybody
              can read back, so once this page is closed the only way to help a child
              who has lost theirs is to make a new one. Print or copy them now.
            </WarnBox>
            <Table head={["Admission no", "Student", "Password", ""]}>
              {made.map((m) => (
                <tr key={m.student_id}>
                  <td className={td}>{m.admission_no}</td>
                  <td className={tdStrong}>{m.student_name}</td>
                  <td className="px-4 py-3 font-mono text-[14px] font-bold text-ink">
                    {m.password}
                  </td>
                  <td className={td}>
                    {m.created ? (
                      <Badge tone="emerald">New</Badge>
                    ) : (
                      <Badge tone="amber">Reset</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            <Button variant="secondary" onClick={() => setMade(null)}>
              I have handed these out
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Children</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Admission no", "Student", "Class", "Login", "Last signed in", ""]}
            empty={rows.length === 0 && "No children here yet."}
          >
            {rows.map((r) => (
              <tr key={r.student_id}>
                <td className={td}>{r.admission_no}</td>
                <td className={tdStrong}>
                  {r.student_name}
                  {r.roll_no && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      Roll {r.roll_no}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {r.class_name} {r.section_name}
                </td>
                <td className={td}>
                  {!r.has_login ? (
                    <Badge tone="neutral">None</Badge>
                  ) : r.is_active ? (
                    <Badge tone="emerald">Active</Badge>
                  ) : (
                    <Badge tone="amber">Switched off</Badge>
                  )}
                </td>
                <td className={td}>
                  {r.last_login_at ? (
                    r.last_login_at.slice(0, 10)
                  ) : (
                    <span className="text-ink-subtle">Never</span>
                  )}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button variant="secondary" loading={busy} onClick={() => one(r.student_id)}>
                      {r.has_login ? "New password" : "Create login"}
                    </Button>
                    {r.has_login && r.is_active && (
                      <Button
                        variant="secondary"
                        aria-label={`Switch off ${r.student_name}`}
                        onClick={() => revoke(r)}
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal
        open={confirmClass}
        onClose={() => setConfirmClass(false)}
        title="Logins for the whole class?"
      >
        <div className="space-y-4">
          <WarnBox>
            Every child in this class gets a password — including those who already
            have one, whose existing password will stop working immediately. If some
            of them are already signing in, use the button on their row instead.
          </WarnBox>
          <p className="text-[13px] text-ink-muted">
            The passwords appear once, on the next screen. Print them before you close
            it.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmClass(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={wholeClass}>
              Create them
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
