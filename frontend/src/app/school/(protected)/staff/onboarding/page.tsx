"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

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
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { daysLeft, readableDate, toIso } from "@/lib/dates";

type Starter = {
  staff_id: number;
  employee_no: string | null;
  full_name: string | null;
  designation: string | null;
  joining_date: string | null;
  total: number;
  done: number;
  outstanding: number;
  overdue: number;
  percent: number;
};
type Task = {
  id: number;
  staff_id: number;
  title: string;
  area: string;
  is_done: boolean;
  done_by: string | null;
  done_at: string | null;
  due_on: string | null;
  note: string | null;
};
type Checklist = {
  staff_id: number;
  employee_no: string | null;
  full_name: string | null;
  designation: string | null;
  joining_date: string | null;
  tasks: Task[];
  total: number;
  done: number;
  outstanding: number;
  overdue: number;
  started: boolean;
  percent: number;
};
type Staff = { id: number; full_name: string; employee_no?: string | null };

const base = "/api/v1/school/hr-ops";
const AREAS = ["hr", "it", "payroll", "workspace", "induction", "safeguarding", "library"];

/** Onboarding: what has to happen before a new starter can get on with it.
 *
 *  A checklist arrives with the standard set already on it. An empty list and
 *  a finished one look identical a fortnight later, so every area gets a row
 *  somebody has to tick — including the ones that turn out not to apply.
 */
export default function OnboardingPage() {
  const [starters, setStarters] = useState<Starter[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [open, setOpen] = useState<Checklist | null>(null);
  const [starting, setStarting] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [startForm, setStartForm] = useState({ staff_id: "", due_on: "" });
  const [taskForm, setTaskForm] = useState({ title: "", area: "hr", due_on: "" });

  const load = () =>
    api
      .get<{ starters: Starter[]; count: number; with_overdue: number }>(
        `${base}/onboarding/outstanding`
      )
      .then((r) => setStarters(r.data.starters))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<Staff[]>("/api/v1/school/staff")
      .then((r) => setStaff(r.data))
      .catch(() => setStaff([]));
  }, []);

  const openChecklist = async (staffId: number) => {
    setError(null);
    try {
      const r = await api.get<Checklist>(`${base}/onboarding/${staffId}`);
      setOpen(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  };

  const start = async () => {
    if (!startForm.staff_id) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Checklist>(`${base}/onboarding/${startForm.staff_id}`, {
        due_on: startForm.due_on || null,
      });
      setOpen(r.data);
      setStarting(false);
      setStartForm({ staff_id: "", due_on: "" });
      setSaved(`${r.data.total} task(s) created — nothing is assumed done.`);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (task: Task) => {
    setError(null);
    try {
      const r = await api.post<Checklist>(`${base}/onboarding/tasks/${task.id}`, {
        is_done: !task.is_done,
      });
      setOpen(r.data);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const addTask = async () => {
    if (!open || !taskForm.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Checklist>(`${base}/onboarding/${open.staff_id}/tasks`, {
        title: taskForm.title.trim(),
        area: taskForm.area,
        due_on: taskForm.due_on || null,
      });
      setOpen(r.data);
      setAddingTask(false);
      setTaskForm({ title: "", area: "hr", due_on: "" });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const withOverdue = starters.filter((s) => s.overdue > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        subtitle="What a new starter still needs before their first week works."
        actions={
          <Button onClick={() => setStarting(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Start a checklist
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      {/* The same four figures the page already counted, read as one summary
          of the screen rather than four separate cards. */}
      <StatStrip
        stats={[
          {
            label: "Starters with work left",
            value: starters.length,
            note: "Checklists not yet finished",
          },
          {
            label: "With something overdue",
            value: withOverdue.length,
            note: withOverdue.length ? "Past a due date" : "Nothing past due",
          },
          {
            label: "Tasks outstanding",
            value: starters.reduce((n, s) => n + s.outstanding, 0),
            note: "Across every open checklist",
          },
          {
            label: "On the list",
            value: staff.length,
            note: "Staff on file",
          },
        ]}
      />

      {withOverdue.length > 0 && (
        <WarnBox>
          {withOverdue.map((s) => s.full_name).join(", ")} have tasks past their due
          date. Somebody starting without an account or a badge finds out on the day.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Starters still being set up</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Everyone with an unfinished checklist, and how far through it they are.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Person", "Joined", "Progress", "Outstanding", "Overdue", ""]}
            empty={
              starters.length === 0 &&
              "Nobody has an unfinished checklist. Start one for a new joiner."
            }
          >
            {starters.map((s) => (
              <tr key={s.staff_id}>
                <td className={tdStrong}>
                  {s.full_name ?? "Unnamed"}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {s.employee_no}
                    {s.designation ? ` · ${s.designation}` : ""}
                  </span>
                </td>
                <td className={td}>
                  {s.joining_date ? readableDate(s.joining_date) : "Not recorded"}
                </td>
                <td className={td}>
                  <Badge tone={s.percent >= 80 ? "emerald" : "amber"}>
                    {s.done} of {s.total}
                  </Badge>
                </td>
                <td className={td}>{s.outstanding}</td>
                <td className={td}>
                  {s.overdue ? <Badge tone="rose">{s.overdue}</Badge> : "—"}
                </td>
                <td className={td}>
                  <Button variant="secondary" onClick={() => openChecklist(s.staff_id)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${starters.length} starter${starters.length === 1 ? "" : "s"} still being set up`}
          right={
            withOverdue.length
              ? `${withOverdue.length} with something overdue`
              : "Nothing overdue"
          }
        />
      </Card>

      {open && (
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>{open.full_name ?? "Checklist"}</CardTitle>
              <p className="mt-1 text-[13px] text-ink-muted">
                {open.employee_no}
                {open.designation ? ` · ${open.designation}` : ""}
                {open.joining_date ? ` · joined ${readableDate(open.joining_date)}` : ""}
                {" · "}
                {open.done} of {open.total} done
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAddingTask(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add a task
              </Button>
              <Button variant="secondary" onClick={() => setOpen(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["", "Task", "Area", "Due", "Done by", ""]}
              empty={open.tasks.length === 0 && "Nothing on this checklist yet."}
            >
              {open.tasks.map((t) => {
                const left = daysLeft(t.due_on);
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={t.is_done}
                        aria-label={t.title}
                        onChange={() => toggle(t)}
                      />
                    </td>
                    <td className={tdStrong}>
                      <span className={t.is_done ? "text-ink-subtle line-through" : ""}>
                        {t.title}
                      </span>
                      {t.note && (
                        <span className="block text-[11px] font-normal text-ink-subtle">
                          {t.note}
                        </span>
                      )}
                    </td>
                    <td className={td}>{humanize(t.area)}</td>
                    <td className={td}>
                      {t.due_on ? (
                        !t.is_done && left !== null && left < 0 ? (
                          <Badge tone="rose">{readableDate(t.due_on)}</Badge>
                        ) : (
                          readableDate(t.due_on)
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={td}>{t.done_by ?? "—"}</td>
                    <td className={td}>
                      {t.is_done ? (
                        <Badge tone="emerald">Done</Badge>
                      ) : (
                        <Badge tone="neutral">To do</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </CardBody>
        </Card>
      )}

      <Modal
        open={starting}
        onClose={() => setStarting(false)}
        title="Start a checklist"
      >
        <div className="space-y-4">
          <Select
            label="Who is starting"
            value={startForm.staff_id}
            onChange={(e) => setStartForm({ ...startForm, staff_id: e.target.value })}
          >
            <option value="">Select…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
                {s.employee_no ? ` (${s.employee_no})` : ""}
              </option>
            ))}
          </Select>
          <Input
            label="Everything due by (optional)"
            type="date"
            value={startForm.due_on}
            min={toIso()}
            hint="Applied to every task on the standard list."
            onChange={(e) => setStartForm({ ...startForm, due_on: e.target.value })}
          />
          <p className="text-[12px] text-ink-subtle">
            The standard set is created straight away, including the parts that may
            turn out not to apply — somebody has to tick those either way, or a task
            nobody did looks the same as one nobody needed.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStarting(false)}>
              Cancel
            </Button>
            <Button onClick={start} loading={busy} disabled={!startForm.staff_id}>
              Create the checklist
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={addingTask} onClose={() => setAddingTask(false)} title="Add a task">
        <div className="space-y-4">
          <Input
            label="What needs doing"
            value={taskForm.title}
            onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
          />
          <Select
            label="Area"
            value={taskForm.area}
            onChange={(e) => setTaskForm({ ...taskForm, area: e.target.value })}
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {humanize(a)}
              </option>
            ))}
          </Select>
          <Input
            label="Due (optional)"
            type="date"
            value={taskForm.due_on}
            onChange={(e) => setTaskForm({ ...taskForm, due_on: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddingTask(false)}>
              Cancel
            </Button>
            <Button onClick={addTask} loading={busy} disabled={!taskForm.title.trim()}>
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
