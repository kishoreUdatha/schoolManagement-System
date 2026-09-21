"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

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
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FilterBar, PanelFooter, PersonCell, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { shortDate } from "@/lib/dates";

/** A select sized for the filter bar: same height as the search box, and
 *  no stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Item = { id: number; name: string; sku: string; unit: string; on_hand: string };
type Move = {
  id: number;
  item_id: number;
  item_name: string;
  kind: string;
  direction: number;
  qty: string;
  moved_on: string;
  reference: string | null;
  issued_to: string | null;
  notes: string | null;
  recorded_by_name: string | null;
  balance_after: string | null;
};

const OUT = "issue";
const BACK = "return_in";

/** Who has taken what out of the store, and what has come back.
 *
 *  "Issued to" is free text on the backend, so this cannot link to a person.
 *  Showing the register grouped by that text is the next best thing: the same
 *  name appearing every week is visible even though nothing joins it to a
 *  staff record.
 */
export default function StockIssuesPage() {
  const [moves, setMoves] = useState<Move[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [days, setDays] = useState(90);
  const [open, setOpen] = useState<null | "issue" | "return">(null);
  const [form, setForm] = useState({ item_id: "", qty: "", issued_to: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = (d = days) => {
    api
      .get<Move[]>("/api/v1/school/inventory/moves", { params: { days: d } })
      .then((r) => setMoves(r.data.filter((m) => m.kind === OUT || m.kind === BACK)))
      .catch((e) => setError(apiError(e)));
    api
      .get<Item[]>("/api/v1/school/inventory/items")
      .then((r) => setItems(r.data))
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const issued = moves.filter((m) => m.kind === OUT);
  const returned = moves.filter((m) => m.kind === BACK);

  // Repeat borrowers are the only thing the free-text field can still tell us.
  const borrowers = useMemo(() => {
    const seen = new Map<string, { name: string; times: number; last: string }>();
    for (const m of issued) {
      const who = (m.issued_to || "").trim();
      if (!who) continue;
      const row = seen.get(who.toLowerCase());
      if (row) {
        row.times += 1;
        if (m.moved_on > row.last) row.last = m.moved_on;
      } else {
        seen.set(who.toLowerCase(), { name: who, times: 1, last: m.moved_on });
      }
    }
    return [...seen.values()].sort((a, b) => b.times - a.times);
  }, [issued]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.post("/api/v1/school/inventory/moves", {
        item_id: Number(form.item_id),
        kind: open === "issue" ? OUT : BACK,
        qty: form.qty,
        issued_to: open === "issue" ? form.issued_to : form.issued_to || null,
        notes: form.notes || null,
      });
      setDone(open === "issue" ? "Issued." : "Booked back in.");
      setOpen(null);
      setForm({ item_id: "", qty: "", issued_to: "", notes: "" });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    form.item_id !== "" &&
    Number(form.qty) > 0 &&
    (open !== "issue" || form.issued_to.trim() !== "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Issues and returns"
        subtitle="What has gone out of the store, who took it, and what has come back."
        actions={
          <>
            <Button onClick={() => setOpen("issue")}>
              <ArrowUpRight className="mr-1.5 h-4 w-4" />
              Issue
            </Button>
            <Button variant="secondary" onClick={() => setOpen("return")}>
              <ArrowDownLeft className="mr-1.5 h-4 w-4" />
              Return
            </Button>
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      {/* The one control that narrows this page belongs above the register,
          not among the buttons that add to it. */}
      <FilterBar>
        <select
          aria-label="Period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={filterSelect}
        >
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
          <option value={365}>Last year</option>
        </select>
      </FilterBar>

      {/* Counted off the moves already loaded for this period. */}
      <StatStrip
        stats={[
          { label: "Issued", value: issued.length, note: `Last ${days} days` },
          { label: "Returned", value: returned.length, note: `Last ${days} days` },
          { label: "People who took something", value: borrowers.length },
          {
            label: "Units out",
            value: issued.reduce((n, m) => n + Number(m.qty), 0),
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>The register</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Every issue and return recorded in the last {days} days.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Date", "Item", "Out or back", "Qty", "Issued to", "Reference", "Recorded by"]}
            empty={moves.length === 0 && "Nothing has been issued or returned in this period."}
          >
            {moves.map((m) => (
              <tr key={m.id}>
                <td className={td}>{shortDate(m.moved_on)}</td>
                <td className={tdStrong}>{m.item_name}</td>
                <td className={td}>
                  <Badge tone={m.kind === OUT ? "amber" : "emerald"}>
                    {m.kind === OUT ? "Issued" : "Returned"}
                  </Badge>
                </td>
                <td className={td}>{m.qty}</td>
                <td className={td}>{m.issued_to || "—"}</td>
                <td className={td}>{m.reference || "—"}</td>
                <td className={td}>{m.recorded_by_name || "—"}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${moves.length} movement(s) in this period`}
          right={`${issued.length} out · ${returned.length} back`}
        />
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Who takes things out</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Grouped by the name typed on the issue, most frequent first.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Name as typed", "Times", "Most recent"]}
            empty={borrowers.length === 0 && "Nobody has been recorded taking anything out."}
          >
            {borrowers.map((b) => (
              <tr key={b.name}>
                <td className="px-4 py-2">
                  {/* No sub-line: the count and the date are columns of their
                      own, and repeating one under the name says nothing new. */}
                  <PersonCell name={b.name} />
                </td>
                <td className={td}>{b.times}</td>
                <td className={td}>{shortDate(b.last)}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${borrowers.length} name(s) recorded`}
          right="Typed by hand, not linked to staff records"
        />
      </Card>
      <p className="text-[12px] text-ink-subtle">
        Names here are typed by hand and are not linked to staff records, so the same
        person spelled two ways will appear twice.
      </p>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === "issue" ? "Issue from the store" : "Book something back in"}
      >
        <div className="space-y-3">
          <Select
            label="Item"
            value={form.item_id}
            onChange={(e) => setForm({ ...form, item_id: e.target.value })}
          >
            <option value="">Choose an item</option>
            {items.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {x.on_hand} {x.unit} on hand
              </option>
            ))}
          </Select>
          <Input
            label="Quantity"
            type="number"
            min={0}
            step="0.01"
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value })}
          />
          <Input
            label={open === "issue" ? "Issued to" : "Returned by (optional)"}
            value={form.issued_to}
            onChange={(e) => setForm({ ...form, issued_to: e.target.value })}
            placeholder="Staff room"
            hint={open === "issue" ? "Required — the store has to know who has it." : undefined}
          />
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={!canSubmit}>
              {open === "issue" ? "Issue" : "Book in"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
