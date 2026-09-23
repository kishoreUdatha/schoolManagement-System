"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel, Person } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { openFile } from "./files";
import { StatusBadge } from "./parts";
import { CERT_KINDS, type Certificate } from "./types";

import { ask } from "@/lib/dialog";
const COLUMNS = ["Certificate no.", "Student", "Type", "Issued on", "Issued by", "Status"];

/**
 * SCR-263, live: GET /api/v1/school/certificates with status and kind.
 * View opens a row: the PDF (each opening is counted as a reprint), cancel
 * with a reason, or for a parent's request, issue or reject it.
 *
 * The table is drawn with the DataTable's markup rather than DataTable
 * itself, because DataTable colours status pills from words and would
 * show "Rejected", "Requested" and "Cancelled" in the "done" green.
 */
export function CertificateRegister() {
  const [typed, setTyped] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const list = useApi<Certificate[]>("/api/v1/school/certificates", { status, kind });

  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    const all = list.data ?? [];
    return q ? all.filter((c) => [c.serial_no, c.student_name, c.admission_no, c.template_name, c.purpose].some((v) => (v ?? "").toLowerCase().includes(q))) : all;
  }, [list.data, typed]);
  const open = openId !== null ? (list.data?.find((c) => c.id === openId) ?? null) : null;
  const waiting = (list.data ?? []).filter((c) => c.status === "requested").length;

  // The figures count the whole register; with a filter on, fetch it unfiltered beside the list.
  const filtered = Boolean(status || kind);
  const whole = useApi<Certificate[]>(filtered ? "/api/v1/school/certificates" : null);
  const all = filtered ? whole.data : list.data;
  const num = (v: number) => (all ? String(v) : "…");
  const count = (st: string) => (all ?? []).filter((c) => c.status === st).length;
  const month = new Date().toISOString().slice(0, 7);
  const stats = [
    { label: "Issued this month", value: num((all ?? []).filter((c) => c.status === "issued" && c.issued_on?.slice(0, 7) === month).length), note: `${count("issued")} valid in all` },
    { label: "Requests waiting", value: num(count("requested")), note: "From parents, to issue or reject" },
    { label: "Cancelled", value: num(count("cancelled")), note: "No longer valid" },
    { label: "Rejected", value: num(count("rejected")), note: "Requests turned down" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search certificate register…" aria-label="Search certificates" />
        </div>
        <select aria-label="Filter type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {CERT_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="issued">Issued</option>
          <option value="requested">Requested</option>
          <option value="cancelled">Cancelled</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {open ? (
        <CertificateCard
          c={open}
          onClose={() => setOpenId(null)}
          onChanged={(m) => {
            notify(m);
            list.reload();
            if (filtered) whole.reload();
          }}
        />
      ) : null}
      <Panel flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c, i) => (
                <tr key={c.id}>
                  <td className="mono">{c.serial_no ?? "—"}</td>
                  <td>
                    <Person name={c.student_name} index={i} sub={`${c.admission_no}${c.section_label ? ` · ${c.section_label}` : ""}`} />
                  </td>
                  <td>{c.template_name ?? label(c.kind)}</td>
                  <td>{date(c.issued_on)}</td>
                  <td>{c.issued_by_name ?? (c.requested_by_name ? `Requested by ${c.requested_by_name}` : "—")}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="right">
                    <button type="button" className="btn" onClick={() => setOpenId(c.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={items.length > 0}>
          {list.loading ? "Loading the register…" : typed || kind || status ? "No certificates match these filters." : "Nothing in the register yet."}
        </div>
        <div className="table-footer">
          <span>{`Showing ${items.length} of ${list.data?.length ?? 0} records`}</span>
          <div className="pages">
            <span>{waiting ? `${waiting} request(s) awaiting a decision` : "Nothing pending"}</span>
          </div>
        </div>
      </Panel>
    </>
  );
}

/** One certificate: PDF, cancel, or decide a request. */
function CertificateCard({ c, onClose, onChanged }: { c: Certificate; onClose: () => void; onChanged: (m: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setReason("");
      onChanged(done);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const pdf = () => run(() => openFile(`/api/v1/school/certificates/${c.id}/pdf`), `Opened ${c.serial_no ?? "the certificate"}.`);
  const needReason = () => (reason.trim().length < 2 ? (setError("Give the reason first."), false) : true);

  return (
    <Panel
      title={`${c.template_name ?? label(c.kind)}${c.serial_no ? ` · ${c.serial_no}` : ""}`}
      sub={`${c.student_name} · ${c.admission_no}${c.section_label ? ` · ${c.section_label}` : ""}`}
      action={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <dl className="kv">
        {(
          [
            ["Status", label(c.status)],
            ["Purpose", c.purpose ?? "—"],
            ["Issued on", date(c.issued_on)],
            ["Issued by", c.issued_by_name ?? "—"],
            ["Requested by", c.requested_by_name ? `${c.requested_by_name} · ${date(c.created_at)}` : "—"],
            ["PDF opened", `${c.print_count} time(s)`],
            ["Remarks", c.remarks ?? "—"],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="gap" />
      <div className="row" style={{ flexWrap: "wrap" }}>
        {c.status === "issued" || c.status === "cancelled" ? (
          <button type="button" className="btn" disabled={busy} onClick={pdf}>
            <Icon name="download" className="sm" />
            {`Open PDF${c.print_count ? ` (${c.print_count})` : ""}`}
          </button>
        ) : null}
        {c.kind === "transfer" && c.status === "issued" ? (
          <Link className="btn" href={`${routeOf(262)}?id=${c.id}`}>
            View certificate
          </Link>
        ) : null}
        {c.status === "requested" ? (
          <Link className="btn primary" href={c.kind === "transfer" ? `${routeOf(262)}?request=${c.id}` : `${routeOf(261)}?request=${c.id}`}>
            <Icon name="check" className="sm" />
            Issue
          </Link>
        ) : null}
        {c.status === "issued" || c.status === "requested" ? (
          <>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={c.status === "issued" ? "Reason for cancelling" : "Reason for rejecting (shown to the parent)"}
              aria-label="Reason"
              maxLength={500}
              style={{ flex: 1, minWidth: 220, height: 38, padding: "0 12px", border: "1px solid #d9e4f2", borderRadius: 8 }}
            />
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={async () =>
                needReason() &&
                (await ask(c.status === "issued" ? `Cancel certificate ${c.serial_no}? It stops being valid and the family sees it cancelled.` : "Reject this certificate request? The family sees your reason.")) &&
                (c.status === "issued"
                  ? run(() => api.post(`/api/v1/school/certificates/${c.id}/cancel`, { reason: reason.trim() }), `Cancelled ${c.serial_no}.`)
                  : run(() => api.post(`/api/v1/school/certificates/${c.id}/decide`, { approve: false, remarks: reason.trim() }), "Request rejected."))
              }
            >
              {c.status === "issued" ? "Cancel certificate" : "Reject request"}
            </button>
          </>
        ) : null}
      </div>
    </Panel>
  );
}

/** Page-head Export: the register as it stands on the server, as CSV. */
export function RegisterExport() {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const rows = await api.get<Certificate[]>("/api/v1/school/certificates");
      const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [
        ["Certificate no.", "Student", "Admission no.", "Class", "Type", "Purpose", "Issued on", "Issued by", "Status", "PDF opened", "Remarks"].map(cell).join(","),
        ...rows.map((c) => [c.serial_no, c.student_name, c.admission_no, c.section_label, c.template_name ?? c.kind, c.purpose, c.issued_on, c.issued_by_name, c.status, c.print_count, c.remarks].map(cell).join(",")),
      ];
      const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-register-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn" onClick={run} disabled={busy}>
      <Icon name="download" className="sm" />
      {busy ? "Exporting…" : "Export"}
    </button>
  );
}
