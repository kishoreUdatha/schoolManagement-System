"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Clock, FileDown, FileText, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
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
import { api, apiError } from "@/lib/api";
import { daysLeft, readableDate } from "@/lib/dates";
import { openAuthed } from "@/lib/download";

/** A select sized for the filter bar: same height as the search box, and
 *  no stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Doc = {
  id: number;
  owner_type: string;
  owner_id: number | null;
  owner_name: string | null;
  category: string;
  title: string;
  content_type: string;
  size_bytes: number;
  original_name: string;
  expires_on: string | null;
  visible_to_parent: boolean;
  uploaded_by_name: string | null;
  uploaded_by_parent: boolean;
  verification_status: string;
  verified_by_name: string | null;
  verified_at: string | null;
  remarks: string | null;
  created_at: string;
};

type Summary = {
  pending_verification: number;
  expiring_soon: number;
  by_owner: Record<string, number>;
};

/** Categories a child's file holds. The API's list also covers staff and
 *  school-wide papers; showing those here would just be noise. */
const CATEGORIES = [
  "birth_certificate",
  "aadhaar",
  "photo",
  "address_proof",
  "transfer_certificate",
  "previous_marksheet",
  "medical",
  "caste_certificate",
  "other",
];

const STATES = ["pending", "verified", "rejected"];

export default function StudentDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Doc[]>("/api/v1/school/documents", {
        params: {
          owner_type: "student",
          category: category || undefined,
          verification: state || undefined,
        },
      })
      .then((r) => setDocs(r.data))
      .catch((e) => setError(apiError(e)));
  }, [category, state]);

  useEffect(() => {
    load();
    api
      .get<Summary>("/api/v1/school/documents/summary")
      .then((r) => setSummary(r.data))
      .catch(() => setSummary(null));
  }, [load]);

  const verify = async (doc: Doc, status: "verified" | "rejected") => {
    setError(null);
    try {
      await api.post(`/api/v1/school/documents/${doc.id}/verify`, { status });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const remove = async (doc: Doc) => {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/documents/${doc.id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const shown = docs.filter((d) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (d.owner_name ?? "").toLowerCase().includes(q) ||
      d.title.toLowerCase().includes(q)
    );
  });

  const expired = shown.filter((d) => {
    const left = daysLeft(d.expires_on);
    return left !== null && left < 0;
  });
  const pending = shown.filter((d) => d.verification_status === "pending");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student documents"
        subtitle="Everything held on a child's file, and whether anybody has checked it."
      />
      <ErrorBox>{error}</ErrorBox>

      {/* Every figure here is one the page already holds: the summary the API
          returned, and counts taken from the rows on screen. */}
      <StatStrip
        stats={[
          {
            label: "On file",
            value: summary?.by_owner?.student ?? shown.length,
            note: "Documents held for children",
            icon: FileText,
          },
          {
            label: "Waiting to be checked",
            value: pending.length,
            note: pending.length ? "Nobody has verified these yet" : "Nothing outstanding",
            icon: Clock,
          },
          {
            label: "Expired",
            value: expired.length,
            note: expired.length ? "Past their expiry date" : "None out of date",
            icon: AlertTriangle,
          },
          {
            label: "Expiring soon",
            value: summary?.expiring_soon ?? "—",
            note: "Across every owner",
            icon: CalendarClock,
          },
        ]}
      />

      <FilterBar>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Child or title…"
          label="Search documents"
        />
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={filterSelect}
        >
          <option value="">Every category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </select>
        <select
          aria-label="Verification"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className={filterSelect}
        >
          <option value="">Any state</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
      </FilterBar>

      {expired.length > 0 && (
        <WarnBox>
          {expired.length} document(s) have passed their expiry date. An out-of-date
          medical note or address proof is the same as not having one when somebody asks
          for it.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Documents</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {[
                category ? humanize(category) : "Every category",
                state ? humanize(state) : "Any state",
                search.trim() ? `Matching “${search.trim()}”` : "All children",
              ].join(" · ")}
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Child", "Document", "Category", "Checked", "Expires", "Uploaded", ""]}
            empty={shown.length === 0 && "No documents have been uploaded for a child yet."}
          >
            {shown.map((d) => {
              const left = daysLeft(d.expires_on);
              return (
                <tr key={d.id}>
                  <td className="px-4 py-3">
                    <PersonCell name={d.owner_name ?? "Unknown"} />
                  </td>
                  <td className={td}>
                    {d.title}
                    <span className="block text-[11px] text-ink-subtle">{d.original_name}</span>
                  </td>
                  <td className={td}>{humanize(d.category)}</td>
                  <td className={td}>
                    <Badge
                      tone={
                        d.verification_status === "verified"
                          ? "emerald"
                          : d.verification_status === "rejected"
                            ? "rose"
                            : "amber"
                      }
                    >
                      {humanize(d.verification_status)}
                    </Badge>
                    {d.verified_by_name && (
                      <span className="block text-[11px] text-ink-subtle">
                        by {d.verified_by_name}
                      </span>
                    )}
                  </td>
                  <td className={td}>
                    {d.expires_on === null ? (
                      <span className="text-ink-subtle">—</span>
                    ) : left !== null && left < 0 ? (
                      <Badge tone="rose">Expired</Badge>
                    ) : left !== null && left <= 30 ? (
                      <Badge tone="amber">{left} day(s)</Badge>
                    ) : (
                      readableDate(d.expires_on)
                    )}
                  </td>
                  <td className={td}>
                    {readableDate(d.created_at.slice(0, 10))}
                    {d.uploaded_by_parent && (
                      <span className="block text-[11px] text-ink-subtle">by a parent</span>
                    )}
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`Open ${d.title}`}
                        onClick={() =>
                          openAuthed(`/api/v1/school/documents/${d.id}/file`, d.original_name)
                        }
                      >
                        <FileDown className="h-4 w-4" />
                      </Button>
                      {d.verification_status !== "verified" && (
                        <Button variant="secondary" size="sm" onClick={() => verify(d, "verified")}>
                          Verify
                        </Button>
                      )}
                      {d.verification_status !== "rejected" && (
                        <Button variant="secondary" size="sm" onClick={() => verify(d, "rejected")}>
                          Reject
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        aria-label={`Delete ${d.title}`}
                        onClick={() => remove(d)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${shown.length} of ${docs.length} document(s)`}
          right={
            pending.length
              ? `${pending.length} still waiting to be checked`
              : "Everything shown has been checked"
          }
        />
      </Card>
    </div>
  );
}
