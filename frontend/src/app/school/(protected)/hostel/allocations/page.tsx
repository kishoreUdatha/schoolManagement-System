"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BedDouble, DoorOpen, LogOut, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { FilterBar, PanelFooter, SearchBox, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { shortDate } from "@/lib/dates";

/** A select sized for the filter bar: same height as the search box, and no
 *  stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Hostel = {
  id: number;
  name: string;
  kind: "boys" | "girls" | "mixed";
  warden_user_id: number | null;
  warden_name: string | null;
  address: string | null;
  monthly_fee: string;
  curfew: string | null;
  is_active: boolean;
  rooms: number;
  beds: number;
  occupied: number;
};

type Resident = {
  allocation_id: number;
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  room_no: string;
  bed_label: string;
  since: string;
  today: Record<string, string>;
  out_now: boolean;
};

type Bed = {
  id: number;
  label: string;
  student_id: number | null;
  student_name: string | null;
  section_label: string | null;
  allocation_id: number | null;
  since: string | null;
};

type Room = {
  id: number;
  room_no: string;
  floor: string | null;
  room_type: string | null;
  monthly_fee: string | null;
  effective_fee: string;
  is_active: boolean;
  beds: Bed[];
};

/** Who is living where, as one register.
 *
 *  There is no endpoint that lists allocations across hostels — residents are
 *  fetched per hostel and stitched together here. That is a handful of calls,
 *  which is fine for the number of hostels a school has and wrong if that
 *  ever stops being true.
 */
export default function HostelAllocationsPage() {
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [rows, setRows] = useState<(Resident & { hostel_id: number; hostel_name: string })[]>([]);
  const [hostelId, setHostelId] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [moving, setMoving] = useState<(Resident & { hostel_name: string }) | null>(null);
  const [freeBeds, setFreeBeds] = useState<{ id: number; label: string; room_no: string }[]>([]);
  const [targetBed, setTargetBed] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hs = (await api.get<Hostel[]>("/api/v1/school/hostels")).data;
      setHostels(hs);
      const wanted = hostelId ? hs.filter((h) => h.id === hostelId) : hs;
      const lists = await Promise.all(
        wanted.map((h) =>
          api
            .get<Resident[]>(`/api/v1/school/hostels/${h.id}/residents`)
            .then((r) => r.data.map((x) => ({ ...x, hostel_id: h.id, hostel_name: h.name })))
            .catch(() => [])
        )
      );
      setRows(lists.flat());
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, [hostelId]);

  useEffect(() => {
    load();
  }, [load]);

  const openMove = async (r: Resident & { hostel_id: number; hostel_name: string }) => {
    setMoving(r);
    setTargetBed("");
    setError(null);
    try {
      const rooms = (
        await api.get<Room[]>(`/api/v1/school/hostels/${r.hostel_id}/rooms`)
      ).data;
      setFreeBeds(
        rooms
          .filter((room) => room.is_active)
          .flatMap((room) =>
            room.beds
              .filter((b) => b.student_id === null)
              .map((b) => ({ id: b.id, label: b.label, room_no: room.room_no }))
          )
      );
    } catch (e) {
      setError(apiError(e));
    }
  };

  const transfer = async () => {
    if (!moving || targetBed === "") return;
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/api/v1/school/hostels/allocations/${moving.allocation_id}/transfer`,
        { bed_id: targetBed }
      );
      setMoving(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const vacate = async (r: Resident) => {
    if (!window.confirm(`Move ${r.student_name} out of bed ${r.bed_label}?`)) return;
    setError(null);
    try {
      await api.post(`/api/v1/school/hostels/allocations/${r.allocation_id}/vacate`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const shown = rows.filter((r) => {
    if (!q.trim()) return true;
    const hay = `${r.student_name} ${r.admission_no} ${r.room_no} ${r.bed_label} ${r.section_label ?? ""}`;
    return hay.toLowerCase().includes(q.trim().toLowerCase());
  });

  const scope = hostelId ? hostels.filter((h) => h.id === hostelId) : hostels;
  const beds = scope.reduce((n, h) => n + h.beds, 0);
  const occupied = scope.reduce((n, h) => n + h.occupied, 0);
  const outNow = rows.filter((r) => r.out_now).length;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Hostel allocations"
        subtitle="Every resident and the bed they hold, rather than one room at a time."
      />
      <ErrorBox>{error}</ErrorBox>

      {/* Narrow the register first — the figures below describe whatever
          hostel scope is selected, not the whole school. */}
      <form onSubmit={(e: FormEvent) => e.preventDefault()}>
        <FilterBar>
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Name, admission no or room…"
            label="Search residents"
          />
          <select
            aria-label="Hostel"
            value={hostelId}
            onChange={(e) => setHostelId(e.target.value ? Number(e.target.value) : "")}
            className={filterSelect}
          >
            <option value="">Every hostel</option>
            {hostels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </FilterBar>
      </form>

      {/* Capacity, exactly as the page already counts it: beds and occupancy
          summed over the hostels in scope, free beds from the same
          Math.max(beds - occupied, 0) the screen has always shown. */}
      <StatStrip
        stats={[
          {
            label: "Beds",
            value: loading ? "—" : beds,
            note: hostelId ? "in this hostel" : "across every hostel",
            icon: BedDouble,
          },
          {
            label: "Occupied",
            value: loading ? "—" : occupied,
            note: beds ? `${Math.round((occupied / beds) * 100)}% full` : undefined,
            icon: UserCheck,
          },
          {
            label: "Free",
            value: loading ? "—" : Math.max(beds - occupied, 0),
            note:
              !loading && beds > 0 && beds - occupied === 0
                ? "every bed is taken"
                : "beds still to allocate",
            icon: DoorOpen,
          },
          {
            label: "Signed out now",
            value: loading ? "—" : outNow,
            note: outNow ? "not in the building" : "everybody accounted for",
            icon: LogOut,
          },
        ]}
      />

      {!loading && beds > 0 && occupied > beds && (
        <NoticeBox>
          More residents are allocated than there are beds recorded. That is
          usually a room whose bed count was reduced after people moved in.
        </NoticeBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Residents</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {[
                hostelId ? hostels.find((h) => h.id === hostelId)?.name : "Every hostel",
                q.trim() ? `matching “${q.trim()}”` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Student", "Hostel", "Room", "Bed", "Since", "", ""]}
            empty={
              !loading &&
              shown.length === 0 &&
              (q ? "Nobody matches that search." : "Nobody has been allocated a bed yet.")
            }
          >
            {shown.map((r) => (
              <tr key={r.allocation_id}>
                <td className={tdStrong}>
                  {r.student_name}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {r.admission_no}
                    {r.section_label ? ` · ${r.section_label}` : ""}
                  </span>
                </td>
                <td className={td}>{r.hostel_name}</td>
                <td className={td}>{r.room_no}</td>
                <td className={td}>{r.bed_label}</td>
                <td className={td}>{shortDate(r.since)}</td>
                <td className={td}>
                  {r.out_now ? <Badge tone="amber">Signed out</Badge> : null}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => openMove(r)}>
                      Move
                    </Button>
                    <Button variant="secondary" onClick={() => vacate(r)}>
                      Vacate
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={
            loading ? "Loading…" : `Showing ${shown.length} of ${rows.length} resident(s)`
          }
          right={loading ? "" : `${Math.max(beds - occupied, 0)} bed(s) free`}
        />
      </Card>

      <Modal
        open={moving !== null}
        onClose={() => setMoving(null)}
        title={moving ? `Move ${moving.student_name}` : ""}
      >
        {moving && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted">
              Currently in room {moving.room_no}, bed {moving.bed_label}, since{" "}
              {shortDate(moving.since)}.
            </p>
            <Select
              label="Move to"
              value={targetBed}
              onChange={(e) => setTargetBed(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Choose a free bed</option>
              {freeBeds.map((b) => (
                <option key={b.id} value={b.id}>
                  Room {b.room_no} · bed {b.label}
                </option>
              ))}
            </Select>
            {freeBeds.length === 0 && (
              <p className="text-[12px] text-ink-subtle">
                Every bed in this hostel is taken. Vacate one first, or add a room.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMoving(null)}>
                Cancel
              </Button>
              <Button onClick={transfer} loading={busy} disabled={targetBed === ""}>
                Move them
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
