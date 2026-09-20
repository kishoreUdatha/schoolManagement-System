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
  Textarea,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime, readableDate } from "@/lib/dates";

type Requisition = {
  id: number;
  title: string;
  department_id: number | null;
  department_name: string | null;
  role_description: string | null;
  headcount: number;
  reason: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "filled" | "cancelled";
  raised_by_user_id: number | null;
  raised_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  needed_by: string | null;
  created_at: string;
};
type Department = { id: number; name: string };

const base = "/api/v1/school/hr-ops";

const TONE: Record<Requisition["status"], "emerald" | "amber" | "rose" | "neutral"> = {
  draft: "neutral",
  submitted: "amber",
  approved: "emerald",
  rejected: "rose",
  filled: "emerald",
  cancelled: "neutral",
};

/** Requests to hire, and who agreed to them.
 *
 *  A job opening is a post being advertised; this is the argument for having
 *  the post at all. Keeping them apart means a refused request stays on
 *  record — which is the one somebody wants to point at next year.
 */
export default function RequisitionsPage() {
  const [rows, setRows] = useState<Requisition[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [state, setState] = useState("");
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<Requisition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    title: "",
    department_id: "",
    role_description: "",
    headcount: "1",
    reason: "",
    needed_by: "",
  });
  const [decision, setDecision] = useState({ approve: true, note: "" });

  const load = (filter = state) =>
    api
      .get<Requisition[]>(`${base}/requisitions`, {
        params: { state: filter || undefined },
      })
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<Department[]>("/api/v1/school/departments")
      .then((r) => setDepartments(r.data))
      .catch(() => setDepartments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/requisitions`, {
        title: form.title.trim(),
        department_id: form.department_id ? Number(form.department_id) : null,
        role_description: form.role_description.trim() || null,
        headcount: Number(form.headcount) || 1,
        reason: form.reason.trim(),
        needed_by: form.needed_by || null,
      });
      setCreating(false);
      setForm({ ...form, title: "", role_description: "", reason: "", needed_by: "" });
      setSaved("Request drafted. Send it when you are ready for a decision.");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (r: Requisition) => {
    setError(null);
    try {
      await api.post(`${base}/requisitions/${r.id}/submit`);
      setSaved(`${r.title} sent for a decision.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/requisitions/${deciding.id}/decide`, {
        approve: decision.approve,
        note: decision.note.trim() || null,
      });
      setDeciding(null);
      setDecision({ approve: true, note: "" });
      load();
    } catch (e) {
      // The refusal when you try to decide your own request is worth reading.
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const mark = async (r: Requisition, status: "filled" | "cancelled") => {
    setError(null);
    try {
      await api.post(`${base}/requisitions/${r.id}/status`, { status });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const waiting = rows.filter((r) => r.status === "submitted");
  const approved = rows.filter((r) => r.status === "approved");
  const posts = approved.reduce((n, r) => n + r.headcount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests to hire"
        subtitle="The case for a post, and who agreed to it — kept apart from the advert."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Select
              aria-label="Status"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                load(e.target.value);
              }}
            >
              <option value="">Everything</option>
              {["draft", "submitted", "approved", "rejected", "filled", "cancelled"].map(
                (s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                )
              )}
            </Select>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New request
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Requests" value={rows.length} />
        <StatCard
          label="Waiting on a decision"
          value={waiting.length}
          accent={waiting.length ? "amber" : "neutral"}
        />
        <StatCard label="Approved" value={approved.length} accent="emerald" />
        <StatCard label="Posts agreed" value={posts} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every request</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Post", "Department", "Posts", "Needed by", "State", "Decision", ""]}
            empty={rows.length === 0 && "Nobody has asked for a post yet."}
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={tdStrong}>
                  {r.title}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {r.reason.length > 70 ? `${r.reason.slice(0, 70)}…` : r.reason}
                  </span>
                </td>
                <td className={td}>{r.department_name ?? "—"}</td>
                <td className={td}>{r.headcount}</td>
                <td className={td}>
                  {r.needed_by ? readableDate(r.needed_by) : "No date"}
                </td>
                <td className={td}>
                  <Badge tone={TONE[r.status]}>{humanize(r.status)}</Badge>
                </td>
                <td className={td}>
                  {r.decided_by ? (
                    <>
                      {r.decided_by}
                      {r.decided_at && (
                        <span className="block text-[11px] text-ink-subtle">
                          {dateTime(r.decided_at)}
                        </span>
                      )}
                      {r.decision_note && (
                        <span className="block text-[11px] text-ink-subtle">
                          {r.decision_note}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-subtle">
                      {r.raised_by ? `Raised by ${r.raised_by}` : "—"}
                    </span>
                  )}
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-2">
                    {r.status === "draft" && (
                      <Button variant="secondary" onClick={() => submit(r)}>
                        Send
                      </Button>
                    )}
                    {(r.status === "submitted" || r.status === "draft") && (
                      <Button onClick={() => setDeciding(r)}>Decide</Button>
                    )}
                    {r.status === "approved" && (
                      <Button variant="secondary" onClick={() => mark(r, "filled")}>
                        Mark filled
                      </Button>
                    )}
                    {["draft", "submitted", "approved"].includes(r.status) && (
                      <Button variant="secondary" onClick={() => mark(r, "cancelled")}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="Ask for a post">
        <div className="space-y-4">
          <Input
            label="Post"
            value={form.title}
            placeholder="Second maths teacher"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Select
            label="Department (optional)"
            value={form.department_id}
            onChange={(e) => setForm({ ...form, department_id: e.target.value })}
          >
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Input
            label="How many"
            type="number"
            min={1}
            value={form.headcount}
            onChange={(e) => setForm({ ...form, headcount: e.target.value })}
          />
          <Textarea
            label="Why the post is needed"
            value={form.reason}
            hint="This is the part somebody reads when deciding, and the part you point at next year."
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
          <Textarea
            label="What the role involves (optional)"
            value={form.role_description}
            onChange={(e) => setForm({ ...form, role_description: e.target.value })}
          />
          <Input
            label="Needed by (optional)"
            type="date"
            value={form.needed_by}
            onChange={(e) => setForm({ ...form, needed_by: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              loading={busy}
              disabled={!form.title || form.reason.trim().length < 3}
            >
              Save as draft
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding ? `Decide: ${deciding.title}` : ""}
      >
        {deciding && (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-subtle px-4 py-3 text-[13px] text-ink-muted">
              <p>
                <strong className="text-ink">{deciding.headcount}</strong> post(s)
                {deciding.department_name ? ` in ${deciding.department_name}` : ""}
                {deciding.needed_by ? `, needed by ${readableDate(deciding.needed_by)}` : ""}
              </p>
              <p className="mt-2">{deciding.reason}</p>
              {deciding.raised_by && (
                <p className="mt-2 text-[12px]">Raised by {deciding.raised_by}.</p>
              )}
            </div>
            <Select
              label="Decision"
              value={decision.approve ? "yes" : "no"}
              onChange={(e) =>
                setDecision({ ...decision, approve: e.target.value === "yes" })
              }
            >
              <option value="yes">Approve</option>
              <option value="no">Refuse</option>
            </Select>
            <Textarea
              label="Note (optional)"
              value={decision.note}
              onChange={(e) => setDecision({ ...decision, note: e.target.value })}
            />
            <p className="text-[12px] text-ink-subtle">
              A request cannot be decided by whoever raised it.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeciding(null)}>
                Cancel
              </Button>
              <Button onClick={decide} loading={busy}>
                Record the decision
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
