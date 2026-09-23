import type { ReactNode } from "react";
import { Badge, Person } from "./primitives";
import { EmptyGuide } from "./states";

/**
 * A cell is text; a person with an optional second line (admission no.); or a
 * line with a quieter one under it, which may carry a bar — "12 / 17" over how
 * far through the class that is, "24 Sep 2026" over "Due in 3 days".
 */
export type Cell = string | { name: string; sub?: string } | { text: string; note?: string; tone?: "warn" | "bad"; percent?: number };
export type Row = Cell[];

const PERSON_COLUMNS = ["Student", "Applicant", "Candidate", "Staff member", "Employee", "Teacher", "Guardian", "User", "Member", "Visitor", "Name", "Homework", "Assignment"];
const STATUS_WORDS = ["status", "stage", "decision", "consent", "result"];
const PROGRESS_COLUMNS = ["Progress", "Attendance", "Collection rate", "Pass rate", "Utilization", "Delivery rate", "Syllabus progress"];
const WRAP_COLUMNS = ["Description", "Learning outcome", "Title", "Announcement", "Particulars", "Observation", "Item", "Homework", "Assignment", "Event"];

const text = (c: Cell) => (typeof c === "string" ? c : "name" in c ? c.name : c.text);

/**
 * What a screen shows when its list is genuinely empty: what is missing, one
 * sentence on why it matters and the screen's own first step. Filters that
 * match nothing keep the plain `empty` line instead.
 */
export type EmptyState = { title: string; note?: string; action?: ReactNode };

const DEFAULT_EMPTY = "No matching records. Try a different filter.";

function Display({ column, cell, index }: { column: string; cell: Cell; index: number }) {
  const v = text(cell);
  if (typeof cell === "object" && "text" in cell) {
    return (
      <div className="cell-lines">
        <span>{cell.text}</span>
        {cell.note ? <small className={cell.tone ?? ""}>{cell.note}</small> : null}
        {cell.percent === undefined ? null : (
          <div className="bar-track">
            <i style={{ width: `${Math.max(0, Math.min(100, cell.percent))}%` }} />
          </div>
        )}
      </div>
    );
  }
  if (PERSON_COLUMNS.includes(column)) {
    return <Person name={v} index={index} sub={typeof cell === "string" ? undefined : cell.sub} />;
  }
  if (STATUS_WORDS.some((w) => column.toLowerCase().includes(w)) && !["—", "0", "1", "2"].includes(v)) {
    return <Badge>{v}</Badge>;
  }
  if (PROGRESS_COLUMNS.includes(column) && v.includes("%")) {
    const p = parseFloat(v.replace("%", ""));
    return (
      <div className="row-progress">
        <div className="bar-track">
          <i style={{ width: `${Number.isNaN(p) ? 80 : p}%` }} />
        </div>
        {v}
      </div>
    );
  }
  return <>{v}</>;
}

/**
 * The mock's record table with its empty state and footer. Search, filters,
 * select-all and "View" are wired by PreviewInteractions through the data-*
 * attributes; swap `rows` for the API response and they keep working.
 */
export function DataTable({
  columns,
  rows,
  selected,
  onSelect,
  selectable = false,
  rowAction = true,
  onView,
  actions,
  total,
  page = 1,
  pages = 1,
  onPage,
  empty,
  emptyState,
}: {
  columns: string[];
  rows: Row[];
  /** Live tables: the rows ticked now, by index. Given with onSelect, the tick boxes appear. */
  selected?: number[];
  onSelect?: (rows: number[]) => void;
  /** Deprecated: tick boxes that did nothing. Pass onSelect instead. */
  selectable?: boolean;
  rowAction?: boolean;
  /** Live tables: open a row. Without it, "View" shows the preview dialog. */
  onView?: (index: number) => void;
  /** Live tables: the row's own buttons (Edit, Approve, Remove…) in place of "View". */
  actions?: (index: number) => ReactNode;
  /** Live tables: the server's count and paging. */
  total?: number;
  page?: number;
  pages?: number;
  onPage?: (page: number) => void;
  /** The line for "loading" and "these filters match nothing". */
  empty?: ReactNode;
  /** Guidance for a list with nothing in it yet; used only when `empty` is left out. */
  emptyState?: EmptyState;
}) {
  const count = total ?? rows.length;
  // Tick boxes are shown only where they do something: a screen that wants
  // them says what happens to the rows by passing onSelect.
  const picking = Boolean(onSelect);
  const chosen = new Set(selected ?? []);
  const all = rows.length > 0 && chosen.size >= rows.length;
  const toggle = (i: number) => {
    const next = new Set(chosen);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onSelect?.([...next].sort((a, b) => a - b));
  };
  return (
    <>
      <div className="table-wrap">
        <table className="data-table" data-filterable="">
          <thead>
            <tr>
              {picking ? (
                <th className="checkcell">
                  <input
                    type="checkbox"
                    checked={all}
                    ref={(el) => {
                      if (el) el.indeterminate = chosen.size > 0 && !all;
                    }}
                    onChange={() => onSelect?.(all ? [] : rows.map((_, i) => i))}
                    aria-label="Select all rows"
                  />
                </th>
              ) : null}
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
              {rowAction ? <th className="right">Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {picking ? (
                  <td className="checkcell">
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={chosen.has(i)}
                      onChange={() => toggle(i)}
                      aria-label={`Select row ${i + 1}`}
                    />
                  </td>
                ) : null}
                {columns.map((c, j) => (
                  <td key={c} className={WRAP_COLUMNS.includes(c) ? "wrap" : ""} data-col={c.toLowerCase()}>
                    <Display column={c} cell={row[j] ?? ""} index={i} />
                  </td>
                ))}
                {rowAction ? (
                  <td className="right">
                    {actions ? (
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {actions(i)}
                      </div>
                    ) : onView ? (
                      <button type="button" className="btn " onClick={() => onView(i)}>
                        View
                      </button>
                    ) : (
                      <button type="button" className="btn " data-view-row="">
                        View
                      </button>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-empty" hidden={rows.length > 0}>
        {empty !== undefined && empty !== null ? (
          empty
        ) : emptyState ? (
          <EmptyGuide {...emptyState} />
        ) : (
          DEFAULT_EMPTY
        )}
      </div>
      <div className="table-footer">
        <span data-table-count="">{`Showing ${rows.length} of ${count} records`}</span>
        <div className="pages">
          {onPage && pages > 1 ? (
            <>
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                ‹
              </button>
              <button type="button" className="active" aria-label={`Page ${page}`}>
                {page}
              </button>
              <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
                ›
              </button>
              <span>{`Page ${page} of ${pages}`}</span>
            </>
          ) : (
            <>
              <button className="active" aria-label="Page 1">
                1
              </button>
              <span>All records on this page</span>
            </>
          )}
        </div>
      </div>
    </>
  );
}
