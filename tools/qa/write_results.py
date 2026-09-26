"""Write the smoke run (out/results.json) into the test plan workbooks.

Only the result columns are filled: Status, Actual Result, Defect ID, Tester
(Smoke Suite and the same cases in Functional Test Cases, which also get the
execution date and the evidence screenshot), and the Defect Log. Formats,
formulas and every other column are left as they are.

    python3 write_results.py [date]
"""
import datetime, json, os, sys
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PLAN = os.path.join(ROOT, "School_ERP_Functional_Test_Plan_and_Cases.xlsx")
EXT = os.path.join(ROOT, "School_ERP_Functional_Testing_Extended_Coverage.xlsx")
DAY = datetime.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today()
TESTER = "Automated smoke run (tools/qa/smoke.js)"
ENV = "QA — local build (web on :3100, API on :8000), fresh database with two schools"

from defects import DEFECTS  # noqa: E402
by_case = {c: d for d in DEFECTS for c in d["cases"]}

results = {r["id"]: r for r in json.load(open(os.path.join(HERE, "out", "results.json")))}


def actual_for(r):
    d = by_case.get(r["id"])
    text = r["actual"]
    if d and d["status"] == "Fixed":
        how = ('blocked', 'test plan corrected') if d['title'].startswith('Test plan') else ('failed', 'fixed')
        text = f"First run {how[0]} ({d['id']}: {d['title'][0].lower() + d['title'][1:]}); {how[1]} and run again: {text}"
    return text


wb = openpyxl.load_workbook(PLAN)
smoke = wb["Smoke Suite"]
hdr = {c.value: c.column for c in smoke[1]}
for row in range(2, smoke.max_row + 1):
    r = results.get(smoke.cell(row, 1).value)
    if not r:
        continue
    smoke.cell(row, hdr["Status"]).value = r["status"]
    smoke.cell(row, hdr["Actual Result"]).value = actual_for(r)
    smoke.cell(row, hdr["Defect ID"]).value = by_case[r["id"]]["id"] if r["id"] in by_case else None
    smoke.cell(row, hdr["Tester"]).value = TESTER

ft = wb["Functional Test Cases"]
hdr = {c.value: c.column for c in ft[1]}
for row in range(2, ft.max_row + 1):
    r = results.get(ft.cell(row, 1).value)
    if not r:
        continue
    ft.cell(row, hdr["Status"]).value = r["status"]
    ft.cell(row, hdr["Actual Result"]).value = actual_for(r)
    ft.cell(row, hdr["Defect ID"]).value = by_case[r["id"]]["id"] if r["id"] in by_case else None
    ft.cell(row, hdr["Tester"]).value = TESTER
    c = ft.cell(row, hdr["Execution Date"])
    c.value, c.number_format = DAY, "yyyy-mm-dd"
    ft.cell(row, hdr["Evidence / Comments"]).value = f"Screenshot: {r['evidence']}"
wb.save(PLAN)

# the RBAC case (authorized access) of each screen a defect names
rbac_file = os.path.join(HERE, "rbac_cases.json")
rbac_ids = {c["scr"]: c["id"] for c in json.load(open(rbac_file)) if c["scenario"] == "authorized"} if os.path.exists(rbac_file) else {}

wb = openpyxl.load_workbook(EXT)
log = wb["Defect Log"]
hdr = {c.value: c.column for c in log[1]}
for i, d in enumerate(DEFECTS, start=2):
    fixed = d["status"] == "Fixed"
    values = {
        "Defect ID": d["id"], "Title": d["title"], "Module": d["module"], "Screen / API": d["screen"],
        "Found In Test Case": ", ".join(d["cases"] + [rbac_ids[s] for s in d.get("rbac", []) if s in rbac_ids]), "Severity": d["sev"], "Priority": d["pri"], "Status": d["status"],
        "Environment": ENV, "Description": d["desc"], "Steps to Reproduce": d["steps"], "Expected Result": d["expected"],
        "Actual Result": d["actual"], "Assigned To": "QA Lead (test plan)" if d["title"].startswith("Test plan") else "Development",
        "Reported By": TESTER, "Reported Date": DAY, "Target Fix": DAY if fixed else None,
        "Retest Status": d["retest"], "Retest By": TESTER if fixed else None, "Retest Date": DAY if fixed else None,
        "Root Cause": d["cause"], "Resolution Notes": d["fix"],
    }
    for k, v in values.items():
        cell = log.cell(i, hdr[k])
        cell.value = v
        if isinstance(v, datetime.date):
            cell.number_format = "yyyy-mm-dd"
wb.save(EXT)
st = [r["status"] for r in results.values()]
print({s: st.count(s) for s in set(st)}, "written;", len(DEFECTS), "defects logged")
