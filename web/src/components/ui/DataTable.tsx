import { Badge, Person } from "./primitives";

/** A cell is text, or a person with an optional second line (admission no.). */
export type Cell = string | { name: string; sub?: string };
export type Row = Cell[];

const PERSON_COLUMNS = ["Student", "Applicant", "Candidate", "Staff member", "Employee", "Teacher", "Guardian", "User", "Member", "Visitor", "Name"];
const STATUS_WORDS = ["status", "stage", "decision", "consent", "result"];
const PROGRESS_COLUMNS = ["Progress", "Attendance", "Collection rate", "Pass rate", "Utilization", "Delivery rate", "Syllabus progress"];
const WRAP_COLUMNS = ["Description", "Learning outcome", "Title", "Announcement", "Particulars", "Observation", "Item", "Homework", "Assignment", "Event"];

const text = (c: Cell) => (typeof c === "string" ? c : c.name);

function Display({ column, cell, index }: { column: string; cell: Cell; index: number }) {
  const v = text(cell);
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
  selectable = true,
  rowAction = true,
}: {
  columns: string[];
  rows: Row[];
  selectable?: boolean;
  rowAction?: boolean;
}) {
  return (
    <>
      <div className="table-wrap">
        <table className="data-table" data-filterable="">
          <thead>
            <tr>
              {selectable ? (
                <th className="checkcell">
                  <input type="checkbox" data-select-all="" aria-label="Select all rows" />
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
                {selectable ? (
                  <td className="checkcell">
                    <input type="checkbox" className="row-check" aria-label={`Select row ${i + 1}`} />
                  </td>
                ) : null}
                {columns.map((c, j) => (
                  <td key={c} className={WRAP_COLUMNS.includes(c) ? "wrap" : ""} data-col={c.toLowerCase()}>
                    <Display column={c} cell={row[j] ?? ""} index={i} />
                  </td>
                ))}
                {rowAction ? (
                  <td className="right">
                    <button type="button" className="btn " data-view-row="">
                      View
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-empty" hidden>
        No matching records. Try a different filter.
      </div>
      <div className="table-footer">
        <span data-table-count="">{`Showing ${rows.length} of ${rows.length} records`}</span>
        <div className="pages">
          <button className="active" aria-label="Page 1">
            1
          </button>
          <span>All records on this page</span>
        </div>
      </div>
    </>
  );
}
