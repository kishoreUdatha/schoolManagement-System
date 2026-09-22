"use client";

import { useState } from "react";
import type { Row } from "@/components/ui/DataTable";
import { date, label, money, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { DateInput, monthLabel, num, ReportView, share } from "./kit";

const n = (v: string | number | null | undefined) => Number(v ?? 0);

// ---------------------------------------------------------------- SCR-278

type Activity = {
  days: number;
  since: string;
  teachers: {
    user_id: number;
    name: string;
    role: string;
    subjects: number;
    class_teacher_of: number;
    syllabus_topics: number;
    syllabus_covered: number;
    syllabus_percent: number;
    marks_entered: number;
    homework_set: number;
    days_attendance_marked: number;
  }[];
};

/** SCR-278, live: GET /api/v1/school/analytics/teacher-activity (?days). Counts of work done, not a ranking. */
export function TeacherActivity() {
  const [days, setDays] = useState("90");
  const res = useApi<Activity>("/api/v1/school/analytics/teacher-activity", { days });
  const d = res.data;
  const t = d?.teachers ?? [];
  const topics = t.reduce((s, x) => s + x.syllabus_topics, 0);
  const covered = t.reduce((s, x) => s + x.syllabus_covered, 0);
  const rows: Row[] = t.map((x) => [
    { name: x.name, sub: label(x.role) },
    num(x.subjects),
    num(x.days_attendance_marked),
    num(x.homework_set),
    num(x.marks_entered),
    x.syllabus_topics ? pct(x.syllabus_percent) : "—",
  ]);
  const withSyllabus = t.filter((x) => x.syllabus_topics);
  return (
    <ReportView
      filters={
        <select aria-label="Period" value={days} onChange={(e) => setDays(e.target.value)}>
          {["30", "90", "180", "365"].map((v) => (
            <option key={v} value={v}>{`Last ${v} days`}</option>
          ))}
        </select>
      }
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Teaching staff", value: num(t.length), note: "Teachers and principals" },
        { label: "Attendance days marked", value: num(t.reduce((s, x) => s + x.days_attendance_marked, 0)), note: d ? `Since ${date(d.since)}` : "In period" },
        { label: "Homework set", value: num(t.reduce((s, x) => s + x.homework_set, 0)), note: "In period" },
        { label: "Syllabus covered", value: topics ? pct(share(covered, topics)) : "—", note: `${num(covered)} of ${num(topics)} topics` },
      ]}
      chart={{ kind: "bars", title: "Attendance days marked", sub: "Per person in the period · a count of work, not a ranking", bars: t.map((x) => ({ label: x.name, value: x.days_attendance_marked, text: num(x.days_attendance_marked) })), empty: "No teaching staff yet." }}
      scope={[
        ["Period", d ? `Last ${d.days} days` : "—"],
        ["Since", d ? date(d.since) : "—"],
        ["Group by", "Person"],
      ]}
      summaryTitle="Syllabus progress"
      summary={withSyllabus.map((x) => ({ label: x.name, value: x.syllabus_percent, text: pct(x.syllabus_percent, 0) }))}
      // Not wired: department, observation score and review status — the API has no appraisal records.
      table={{ name: "teacher-activity", title: "Work done by person", sub: "Counts for the period; not a performance ranking", columns: ["Teacher", "Subjects", "Attendance days", "Homework set", "Marks entered", "Syllabus progress"], rows, empty: "No teaching staff yet." }}
    />
  );
}

// ---------------------------------------------------------------- SCR-279

type Transport = {
  routes: {
    route_id: number;
    route_name: string;
    vehicle: string | null;
    capacity: number;
    riders: number;
    free_seats: number;
    utilisation: number;
    over_capacity: boolean;
    /** today's morning trip sheet; null when none was opened today */
    boarded_today: number | null;
    trip_status_today: string | null;
    /** logged odometer average, else stop-to-stop map distance */
    distance_km: number | null;
  }[];
  total_capacity: number;
  total_riders: number;
  utilisation: number;
  over_capacity: unknown[];
};

/** SCR-279, live: GET /api/v1/school/analytics/transport. */
export function TransportReport() {
  const res = useApi<Transport>("/api/v1/school/analytics/transport");
  const d = res.data;
  const routes = d?.routes ?? [];
  const rows: Row[] = routes.map((r) => [
    { name: r.route_name, sub: r.vehicle ?? undefined },
    num(r.capacity),
    num(r.riders),
    r.boarded_today === null ? "No trip today" : `${num(r.boarded_today)} of ${num(r.riders)}`,
    r.distance_km === null ? "—" : `${r.distance_km.toLocaleString("en-IN")} km`,
    pct(r.utilisation),
    r.over_capacity ? "Over capacity" : "Within capacity",
  ]);
  const boardedToday = routes.reduce((s, r) => s + (r.boarded_today ?? 0), 0);
  const runningToday = routes.filter((r) => r.boarded_today !== null).length;
  const bands: [string, (u: number) => boolean][] = [
    ["Over 90%", (u) => u > 90],
    ["50–90%", (u) => u >= 50 && u <= 90],
    ["Under 50%", (u) => u < 50],
  ];
  return (
    <ReportView
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Routes", value: num(routes.length), note: `${num(d?.over_capacity.length)} over capacity` },
        { label: "Seats", value: num(d?.total_capacity), note: "Across route vehicles" },
        { label: "Riders", value: num(d?.total_riders), note: d ? `${num(boardedToday)} boarded today on ${runningToday} route(s)` : "Students assigned" },
        { label: "Utilization", value: d ? pct(d.utilisation) : "—", note: "Riders ÷ seats" },
      ]}
      chart={{ kind: "bars", title: "Utilization by route", sub: "Riders against seats", percent: true, bars: routes.map((r) => ({ label: r.route_name, value: r.utilisation, text: pct(r.utilisation, 0) })), empty: "No routes set up yet." }}
      scope={[
        ["Routes", num(routes.length)],
        ["Measure", "Assigned riders ÷ seats"],
        ["Group by", "Route"],
      ]}
      summaryTitle="Routes by load"
      summary={routes.length ? bands.map(([l, f]) => { const c = routes.filter((r) => f(r.utilisation)).length; return { label: l, value: share(c, routes.length), text: `${c}` }; }) : []}
      table={{
        name: "transport-utilization",
        sub: "Boarded: today's morning trip sheet · distance: logged odometer readings, else the stops' map points",
        columns: ["Route", "Capacity", "Assigned", "Boarded today", "Distance", "Utilization", "Status"],
        rows,
        empty: "No routes set up yet.",
      }}
    />
  );
}

// ---------------------------------------------------------------- SCR-280

type Library = {
  from_date: string;
  to_date: string;
  issued: number;
  returned: number;
  copies: number;
  out_now: number;
  shelf_in_use: number;
  by_month: { month: string; issued: number; returned: number }[];
  top_titles: { book_id: number; title: string; times: number }[];
  /** distinct borrowers in the period */
  members: number;
  /** loans out past their due date now */
  overdue_now: number;
  by_category: { category: string; members: number; issues: number; returns: number; overdue: number; most_borrowed: string | null }[];
};

/** SCR-280, live: GET /api/v1/school/analytics/library (?from&to). */
export function LibraryReport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const res = useApi<Library>("/api/v1/school/analytics/library", { from, to });
  const d = res.data;
  const rows: Row[] = (d?.by_category ?? []).map((c) => [c.category, num(c.members), num(c.issues), num(c.returns), num(c.overdue), c.most_borrowed ?? "—"]);
  const months = d?.by_month ?? [];
  const range = d ? `${date(d.from_date)} – ${date(d.to_date)}` : "—";
  return (
    <ReportView
      filters={
        <>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
        </>
      }
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Issued", value: num(d?.issued), note: range },
        { label: "Members", value: num(d?.members), note: `Borrowed in the period · ${num(d?.returned)} returned` },
        { label: "Out now", value: num(d?.out_now), note: `Of ${num(d?.copies)} copies` },
        { label: "Overdue", value: num(d?.overdue_now), note: d ? `Out past due · ${pct(d.shelf_in_use)} of the shelf out` : "Out past the due date" },
      ]}
      chart={{ kind: "bars", title: "Issues by month", sub: "Books issued each month", bars: months.map((m) => ({ label: monthLabel(m.month), value: m.issued, text: num(m.issued) })), empty: "Nothing was issued in this period." }}
      scope={[
        ["Date range", range],
        ["Copies", num(d?.copies)],
        ["Group by", "Category"],
      ]}
      summaryTitle="Returns by month"
      summary={months.map((m) => ({ label: monthLabel(m.month), value: share(m.returned, m.issued), text: `${m.returned}/${m.issued}` }))}
      table={{
        name: "library-by-category",
        sub: "Borrowing in the selected period by book category · overdue is out past its due date now",
        columns: ["Category", "Members", "Issues", "Returns", "Overdue", "Most borrowed"],
        rows,
        empty: "Nothing was borrowed in this period.",
      }}
    />
  );
}

// ---------------------------------------------------------------- SCR-281

type Inventory = {
  stock_value: string;
  asset_value: string;
  items: number;
  assets: number;
  by_category: { label: string; items: number; value: string }[];
  assets_by_status: { label: string; count: number; value: string }[];
  low_stock: { item_id: number; name: string; sku: string | null; on_hand: string; reorder_level: string }[];
};

/** SCR-281, live: GET /api/v1/school/analytics/inventory. */
export function InventoryReport() {
  const [by, setBy] = useState<"category" | "assets" | "low">("category");
  const res = useApi<Inventory>("/api/v1/school/analytics/inventory");
  const d = res.data;
  const stock = n(d?.stock_value);
  const assetCount = d?.assets ?? 0;
  const tables = {
    category: { name: "stock-by-category", columns: ["Category", "Items", "Stock value", "Share"], rows: (d?.by_category ?? []).map((c) => [c.label, num(c.items), money(Math.round(n(c.value))), pct(share(n(c.value), stock))]) as Row[], title: "Stock by category" },
    assets: { name: "assets-by-status", columns: ["Status", "Assets", "Value"], rows: (d?.assets_by_status ?? []).map((a) => [label(a.label), num(a.count), money(a.value)]) as Row[], title: "Assets by status" },
    low: { name: "low-stock", columns: ["Item", "SKU", "On hand", "Reorder level"], rows: (d?.low_stock ?? []).map((l) => [l.name, l.sku ?? "—", num(l.on_hand), num(l.reorder_level)]) as Row[], title: "Low stock" },
  };
  const tb = tables[by];
  return (
    <ReportView
      filters={
        <select aria-label="Show" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
          <option value="category">Stock by category</option>
          <option value="assets">Assets by status</option>
          <option value="low">Low stock</option>
        </select>
      }
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Stock value", value: d ? money(Math.round(stock)) : "—", note: `${num(d?.items)} items` },
        { label: "Asset value", value: money(d?.asset_value), note: `${num(d?.assets)} assets` },
        { label: "Low stock", value: num(d?.low_stock.length), note: "At or under reorder level" },
        { label: "Under repair", value: num(d?.assets_by_status.find((a) => a.label === "under_repair")?.count ?? (d ? 0 : undefined)), note: "Assets" },
      ]}
      chart={{ kind: "bars", title: "Stock value by category", sub: "What the store holds, at cost", bars: (d?.by_category ?? []).map((c) => ({ label: c.label, value: n(c.value), text: money(Math.round(n(c.value))) })), empty: "Nothing in stock yet." }}
      scope={[
        ["As of", date(new Date().toISOString())],
        ["Showing", tb.title],
        ["Group by", by === "category" ? "Category" : by === "assets" ? "Asset status" : "Item"],
      ]}
      summaryTitle="Assets by status"
      summary={(d?.assets_by_status ?? []).map((a) => ({ label: label(a.label), value: share(a.count, assetCount), text: `${a.count}` }))}
      table={{ name: tb.name, title: tb.title, columns: tb.columns, rows: tb.rows, empty: by === "low" ? "Nothing is running low." : "Nothing recorded yet." }}
    />
  );
}

// ---------------------------------------------------------------- SCR-282

type Notices = {
  from_date: string;
  to_date: string;
  notices: number;
  recipients: number;
  by_audience: { label: string; count: number }[];
  by_month: { month: string; count: number }[];
  /** read: opened by the recipient — only the in-app inbox records reading */
  channels: { channel: string; total: number; queued: number; sent: number; delivered: number; failed: number; skipped: number; read: number }[];
};

/** SCR-282, live: GET /api/v1/school/analytics/notifications (?from&to). */
export function NotificationReport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const res = useApi<Notices>("/api/v1/school/analytics/notifications", { from, to });
  const d = res.data;
  const ch = d?.channels ?? [];
  const total = ch.reduce((s, c) => s + c.total, 0);
  const failed = ch.reduce((s, c) => s + c.failed, 0);
  const skipped = ch.reduce((s, c) => s + c.skipped, 0);
  const audience = d?.by_audience ?? [];
  const aTotal = audience.reduce((s, a) => s + a.count, 0);
  const rows: Row[] = ch.map((c) => [label(c.channel), num(c.total), num(c.sent), num(c.delivered), c.channel === "in_app" ? num(c.read) : "—", num(c.queued + c.skipped), num(c.failed)]);
  const range = d ? `${date(d.from_date)} – ${date(d.to_date)}` : "—";
  return (
    <ReportView
      filters={
        <>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
        </>
      }
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Notices", value: num(d?.notices), note: range },
        { label: "Recipients", value: num(d?.recipients), note: "People reached" },
        { label: "Failed", value: num(failed), note: total ? `${pct(share(failed, total))} of messages` : "Messages" },
        { label: "Skipped", value: num(skipped), note: "Not sent; counted apart from failed" },
      ]}
      chart={{ kind: "bars", title: "Notices by audience", sub: "Who the notices were sent to", bars: audience.map((a) => ({ label: label(a.label), value: a.count, text: num(a.count) })), empty: "No notices in this period." }}
      scope={[
        ["Date range", range],
        ["Channels", num(ch.length)],
        ["Group by", "Channel"],
      ]}
      summaryTitle="Audience share"
      summary={audience.map((a) => ({ label: label(a.label), value: share(a.count, aTotal), text: pct(share(a.count, aTotal), 0) }))}
      table={{
        name: "notification-channels",
        sub: "Read is counted for the in-app inbox, the only channel that knows when a message is opened",
        columns: ["Channel", "Messages", "Sent", "Delivered", "Read", "Queued / skipped", "Failed"],
        rows,
        empty: "No messages in this period.",
      }}
    />
  );
}
