"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

import { Route, TransportTabs, hhmm } from "../TransportTabs";

type Assignment = {
  id: number;
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  route_id: number;
  route_name: string;
  stop_id: number;
  stop_name: string;
  pickup_time: string | null;
  drop_time: string | null;
  direction: "both" | "pickup" | "drop";
  monthly_fee: string;
  start_date: string;
  end_date: string | null;
};

export default function TransportStudentsPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState("");
  const [search, setSearch] = useState("");
  const [showEnded, setShowEnded] = useState(false);
  const [items, setItems] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<{ student?: PickedStudent } | null>(null);

  async function load() {
    try {
      const params: Record<string, string | boolean> = { include_ended: showEnded };
      if (routeId) params.route_id = routeId;
      if (search) params.search = search;
      const { data } = await api.get<Assignment[]>("/api/v1/school/transport/assignments", { params });
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    api.get<Route[]>("/api/v1/school/transport/routes").then((r) => setRoutes(r.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, showEnded]);

  async function end(a: Assignment) {
    if (!window.confirm(`Stop transport for ${a.student_name} from today?`)) return;
    try {
      await api.post(`/api/v1/school/transport/assignments/${a.id}/end`, {});
      setNotice(`${a.student_name} removed from ${a.route_name}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport"
        subtitle="Which students use which route and stop."
        actions={<Button onClick={() => setAssigning({})}>+ Assign student</Button>}
      />
      <TransportTabs />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <Select label="Route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          <option value="">All routes</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} · {r.name}
            </option>
          ))}
        </Select>
        <Input label="Search" placeholder="Name or admission no." value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
          <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
          Include history
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <Card>
        <Table
          head={["Student", "Class", "Route", "Stop", "Pickup / drop", "Uses", "Fee", "Since", ""]}
          empty={items.length === 0 && "No students assigned."}
        >
          {items.map((a) => (
            <tr key={a.id} className="hover:bg-surface-hover">
              <td className={tdStrong}>
                {a.student_name}
                <div className="text-xs font-normal text-ink-subtle">{a.admission_no}</div>
              </td>
              <td className={td}>{a.section_label ?? "—"}</td>
              <td className={td}>{a.route_name}</td>
              <td className={td}>{a.stop_name}</td>
              <td className={td}>
                {hhmm(a.pickup_time)} / {hhmm(a.drop_time)}
              </td>
              <td className={td}>{a.direction === "both" ? "Both ways" : humanize(a.direction) + " only"}</td>
              <td className={td}>{inr(a.monthly_fee)}</td>
              <td className={td}>
                {a.start_date}
                {a.end_date && <div className="text-xs text-ink-subtle">ended {a.end_date}</div>}
              </td>
              <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                {a.end_date ? (
                  <Badge>ended</Badge>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setAssigning({
                          student: { id: a.student_id, full_name: a.student_name, admission_no: a.admission_no },
                        })
                      }
                    >
                      Move
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => end(a)}>
                      Remove
                    </Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {assigning && (
        <AssignModal
          routes={routes.filter((r) => r.is_active)}
          initialStudent={assigning.student ?? null}
          onClose={() => setAssigning(null)}
          onSaved={(m) => {
            setAssigning(null);
            setNotice(m);
            load();
          }}
        />
      )}
    </div>
  );
}

function AssignModal({
  routes,
  initialStudent,
  onClose,
  onSaved,
}: {
  routes: Route[];
  initialStudent: PickedStudent | null;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const [student, setStudent] = useState<PickedStudent | null>(initialStudent);
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const [direction, setDirection] = useState("both");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const route = useMemo(() => routes.find((r) => String(r.id) === routeId), [routes, routeId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/school/transport/assignments", {
        student_id: student.id,
        route_id: Number(routeId),
        stop_id: Number(stopId),
        direction,
        start_date: startDate,
      });
      onSaved(`${student.full_name} assigned to ${route?.name}.`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initialStudent ? `Move ${initialStudent.full_name}` : "Assign student"}>
      <form onSubmit={submit} className="space-y-4">
        <StudentPicker value={student} onChange={setStudent} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Route *"
            value={routeId}
            onChange={(e) => {
              setRouteId(e.target.value);
              setStopId("");
            }}
            required
          >
            <option value="">Select</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.name}
              </option>
            ))}
          </Select>
          <Select label="Stop *" value={stopId} onChange={(e) => setStopId(e.target.value)} required>
            <option value="">Select</option>
            {route?.stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {hhmm(s.pickup_time)} · {inr(s.effective_fee)}
              </option>
            ))}
          </Select>
          <Select label="Uses" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="both">Both ways</option>
            <option value="pickup">Morning pickup only</option>
            <option value="drop">Afternoon drop only</option>
          </Select>
          <Input label="From" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        {initialStudent && (
          <p className="text-xs text-ink-subtle">
            The current assignment ends the day before the new one starts.
          </p>
        )}
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!student || !stopId}>
            Assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
