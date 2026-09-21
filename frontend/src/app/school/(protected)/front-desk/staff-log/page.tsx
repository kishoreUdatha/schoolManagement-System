"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  td,
} from "@/components/ui/Field";
import {
  FilterBar,
  PanelFooter,
  PersonCell,
  SearchBox,
  StatStrip,
} from "@/components/ui/Workspace";
import { Car, DoorOpen, ListFilter, Users } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

/** A select sized for the filter bar: same height as the search box. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Visit = {
  id: number;
  visitor_name: string;
  phone: string;
  id_type: string | null;
  id_last4: string | null;
  company: string | null;
  purpose: string;
  purpose_detail: string | null;
  host_user_id: number | null;
  host_name: string | null;
  student_id: number | null;
  student_name: string | null;
  people_count: number;
  vehicle_no: string | null;
  status: "expected" | "checked_in" | "checked_out" | "denied" | "cancelled";
  expected_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  pass_no: string | null;
  minutes_inside: number | null;
  notes: string | null;
};

const TONE: Record<Visit["status"], "emerald" | "amber" | "rose" | "neutral" | "brand"> = {
  expected: "neutral",
  checked_in: "amber",
  checked_out: "emerald",
  denied: "rose",
  cancelled: "neutral",
};

const hhmmOf = (iso: string | null) => (iso ? iso.slice(11, 16) : null);

/** The gate log: everything that came through, and what it arrived in.
 *
 *  The visit record has no notion of a staff entry — its purposes are
 *  meeting, delivery, vendor and so on, and host_name is the person being
 *  visited rather than the person arriving. So this is every movement at the
 *  gate, with a vehicle filter, rather than a staff register pretending to
 *  be one.
 */
export default function GateLogPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [on, setOn] = useState("");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "vehicles" | "inside">("vehicles");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (search = q) => {
      setLoading(true);
      api
        .get<Visit[]>("/api/v1/school/front-desk/visits", {
          params: {
            on: on || undefined,
            q: search || undefined,
            inside_only: only === "inside",
          },
        })
        .then((r) => setVisits(r.data))
        .catch((e) => setError(apiError(e)))
        .finally(() => setLoading(false));
    },
    [on, q, only]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, only]);

  const shown =
    only === "vehicles" ? visits.filter((v) => v.vehicle_no?.trim()) : visits;
  const inside = visits.filter((v) => v.status === "checked_in");
  const withVehicle = visits.filter((v) => v.vehicle_no?.trim());
  const stillIn = shown.filter((v) => v.status === "checked_in").length;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Gate log"
        subtitle="Movements through the gate, and the vehicles that came with them."
      />

      {/* Four tallies over the one list this page loaded — the server is
          asked once, for the window the filters describe. */}
      <StatStrip
        stats={[
          { label: "Movements", value: loading ? "—" : visits.length, note: on || "Today and before", icon: Users },
          {
            label: "With a vehicle",
            value: loading ? "—" : withVehicle.length,
            note: "Noted a registration",
            icon: Car,
          },
          {
            label: "Still inside",
            value: loading ? "—" : inside.length,
            note: inside.length ? "Not signed out" : "Everyone signed out",
            icon: DoorOpen,
          },
          {
            label: "Shown",
            value: loading ? "—" : shown.length,
            note: "After the filter below",
            icon: ListFilter,
          },
        ]}
      />

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          load();
        }}
      >
        <FilterBar>
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Name, phone or vehicle"
            label="Search the log"
          />
          <input
            type="date"
            aria-label="On"
            value={on}
            onChange={(e) => setOn(e.target.value)}
            className={filterSelect}
          />
          <select
            aria-label="Show"
            value={only}
            onChange={(e) => setOnly(e.target.value as typeof only)}
            className={filterSelect}
          >
            <option value="vehicles">With a vehicle</option>
            <option value="inside">Still inside</option>
            <option value="all">Everything</option>
          </select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </FilterBar>
      </form>

      <ErrorBox>{error}</ErrorBox>

      <NoticeBox>
        A visit does not record whether the person arriving is staff — it records
        who they came to see. So this is the whole gate log rather than a staff
        register, filtered by default to entries that noted a vehicle.
      </NoticeBox>

      {inside.length > 0 && (
        <WarnBox>
          {inside.length} {inside.length === 1 ? "person has" : "people have"} not
          signed out: {inside.map((v) => v.visitor_name).join(", ")}.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              {only === "vehicles"
                ? "Vehicle movements"
                : only === "inside"
                  ? "Still inside"
                  : "Every movement"}
            </CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {[on ? on : "All dates", q ? `Matching “${q}”` : "No search term"].join(" · ")}
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Who", "Vehicle", "Came to see", "Purpose", "In", "Out", "State"]}
            empty={
              !loading &&
              shown.length === 0 &&
              (only === "vehicles"
                ? "No entry has recorded a vehicle yet."
                : "Nothing has been logged at the gate.")
            }
          >
            {shown.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3">
                  <PersonCell
                    name={v.visitor_name}
                    sub={`${v.phone}${v.company ? ` · ${v.company}` : ""}${
                      v.people_count > 1 ? ` · ${v.people_count} people` : ""
                    }`}
                  />
                </td>
                <td className={td}>
                  {v.vehicle_no ? (
                    <span className="font-mono text-ink">{v.vehicle_no}</span>
                  ) : (
                    <span className="text-ink-subtle">On foot</span>
                  )}
                </td>
                <td className={td}>
                  {v.host_name ?? v.student_name ?? "—"}
                  {v.pass_no && (
                    <span className="block font-mono text-[11px] text-ink-subtle">
                      {v.pass_no}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {humanize(v.purpose)}
                  {v.purpose_detail && (
                    <span className="block text-[11px] text-ink-subtle">
                      {v.purpose_detail}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {v.check_in_at ? (
                    <>
                      {hhmmOf(v.check_in_at)}
                      <span className="block text-[11px] text-ink-subtle">
                        {dateTime(v.check_in_at)}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className={td}>
                  {v.check_out_at ? (
                    <>
                      {hhmmOf(v.check_out_at)}
                      {v.minutes_inside !== null && (
                        <span className="block text-[11px] text-ink-subtle">
                          {v.minutes_inside} min inside
                        </span>
                      )}
                    </>
                  ) : v.status === "checked_in" ? (
                    <Badge tone="amber">Still inside</Badge>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className={td}>
                  <Badge tone={TONE[v.status]}>{humanize(v.status)}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={loading ? "Loading…" : `Showing ${shown.length} of ${visits.length} movements`}
          right={stillIn > 0 ? `${stillIn} still inside in this view` : "Nobody outstanding here"}
        />
      </Card>
    </div>
  );
}
