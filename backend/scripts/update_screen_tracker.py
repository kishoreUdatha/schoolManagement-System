"""Record which of the 296 mock screens are built, in the tracker itself.

Companion to update_api_tracker.py. That one answers "does the endpoint
exist"; this one answers "can somebody actually open this screen".

The audit lives in screen_audit.tsv beside this file, one line per screen:

    SCR-001<tab>Done<tab>Done<tab>/school/students<tab>note

so the judgement is reviewable in the diff rather than buried in a spreadsheet
cell. Re-run after building screens:

    python backend/scripts/update_screen_tracker.py

Excel must be closed. Columns written: Frontend, API / DB, Next action,
Last updated, and an audit column naming the route that implements the screen.
Owner, QA, Acceptance and Deployment are left alone — those are the school's
process columns, not something a code audit can answer.
"""
import csv
import shutil
import sys
from datetime import date
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

ROOT = Path(__file__).resolve().parents[2]
XLSX = ROOT / "School_ERP_296_Development_Tracker.xlsx"
AUDIT = Path(__file__).resolve().parent / "screen_audit.tsv"

HEADER_ROW = 6
FIRST_ROW = 7
COL = {  # 1-based, as the sheet has them
    "id": 1, "name": 2, "module": 3,
    "frontend": 10, "api": 11, "next_action": 18,
    "last_updated": 21, "not_required_reason": 22,
    "audit": 28,  # added by this script
}

# our verdicts -> the sheet's own dropdown values
FRONTEND = {"Done": "Done", "Partial": "In progress", "Missing": "Not started"}
API = {"Done": "Done", "Partial": "In progress", "Missing": "Not started",
       "Not required": "Not required"}

FILL = {
    "Done": PatternFill("solid", fgColor="E9F7F0"),
    "In progress": PatternFill("solid", fgColor="FFF3D8"),
    "Not started": PatternFill("solid", fgColor="FFEBEE"),
    "Not required": PatternFill("solid", fgColor="EEF2F7"),
}
INK = {"Done": "07845E", "In progress": "8E5C05", "Not started": "B82E45",
       "Not required": "62718B"}


def read_audit() -> dict[str, dict]:
    rows: dict[str, dict] = {}
    with AUDIT.open(encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 4:
                raise SystemExit(f"Malformed audit line: {line[:60]}")
            sid, fe, api, where = parts[0], parts[1], parts[2], parts[3]
            note = parts[4] if len(parts) > 4 else ""
            if fe not in FRONTEND:
                raise SystemExit(f"{sid}: unknown frontend verdict {fe!r}")
            if api not in API:
                raise SystemExit(f"{sid}: unknown api verdict {api!r}")
            rows[sid] = {"frontend": fe, "api": api, "where": where, "note": note}
    return rows


def main() -> int:
    if not XLSX.exists():
        print(f"Missing {XLSX.name}", file=sys.stderr)
        return 2
    lock = XLSX.with_name("~$" + XLSX.name)
    if lock.exists():
        print("The tracker is open in Excel — close it and run again.", file=sys.stderr)
        return 2

    audit = read_audit()
    shutil.copyfile(XLSX, XLSX.with_suffix(".backup.xlsx"))
    wb = load_workbook(XLSX)
    ws = wb["Screen Tracker"]

    head = ws.cell(HEADER_ROW, COL["audit"])
    head.value = "Implemented at (audit)"
    head.font = Font(bold=True)
    head.alignment = Alignment(horizontal="left")
    ws.column_dimensions["AB"].width = 46

    today = date.today()
    seen, counts = set(), {"frontend": {}, "api": {}}
    for row in range(FIRST_ROW, ws.max_row + 1):
        sid = ws.cell(row, COL["id"]).value
        if not sid:
            continue
        a = audit.get(str(sid).strip())
        if not a:
            continue
        seen.add(str(sid).strip())

        fe, api = FRONTEND[a["frontend"]], API[a["api"]]
        counts["frontend"][fe] = counts["frontend"].get(fe, 0) + 1
        counts["api"][api] = counts["api"].get(api, 0) + 1

        for key, value in (("frontend", fe), ("api", api)):
            cell = ws.cell(row, COL[key])
            cell.value = value
            cell.fill = FILL[value]
            cell.font = Font(color=INK[value], bold=True)

        ws.cell(row, COL["audit"]).value = a["where"]
        ws.cell(row, COL["last_updated"]).value = today
        ws.cell(row, COL["last_updated"]).number_format = "yyyy-mm-dd"
        if a["note"]:
            ws.cell(row, COL["next_action"]).value = a["note"]
        if api == "Not required":
            ws.cell(row, COL["not_required_reason"]).value = a["note"] or "No data behind this screen"

    missing = set(audit) - seen
    if missing:
        print(f"WARNING: {len(missing)} audited ids not found in the sheet: {sorted(missing)[:6]}")

    wb.save(XLSX)
    print(f"saved {XLSX.name} — {len(seen)} screens updated")
    print("  frontend:", dict(sorted(counts["frontend"].items())))
    print("  api/db:  ", dict(sorted(counts["api"].items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
