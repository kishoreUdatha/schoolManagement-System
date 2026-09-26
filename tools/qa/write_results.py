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

# What the first run found, what was done, and which cases it touched. The
# cases were run again after each fix; results.json is that final run.
DEFECTS = [
    {"id": "DEF-001", "cases": ["FT-00065", "FT-02105"], "title": "Dashboards throw React error #425 on a full page load",
     "module": "Role Dashboards / Reports & Analytics", "screen": "SCR-009 Platform Dashboard, SCR-264 Executive Analytics (also SCR-138, clinic, front desk)",
     "sev": "Medium", "pri": "P2", "status": "Fixed", "retest": "Pass",
     "desc": "The greeting was worked out while the page rendered: the server, which does not know who is signed in, wrote 'Good morning, there.' and the browser 'Good morning, <name>.', so React reported a hydration text mismatch (error #425) and re-rendered the page.",
     "steps": "1. Sign in as the super admin. 2. Open /platform/platform-dashboard directly or press refresh. 3. Watch the browser console.",
     "expected": "The dashboard loads with no page errors.", "actual": "Uncaught 'Minified React error #425' on load.",
     "cause": "Name and date rendered on the server, before the signed-in user and the viewer's clock are known.",
     "fix": "The five dashboards now use the shared useGreeting() hook, which shows the name and date once the page is running in the browser (as the other dashboards already did)."},
    {"id": "DEF-002", "cases": ["FT-00889"], "title": "Class teacher cannot open the attendance register for their own section",
     "module": "Student Attendance", "screen": "SCR-112 Student Attendance Register; GET /school/reports/attendance/student-monthly, /students/{id}",
     "sev": "High", "pri": "P1", "status": "Fixed", "retest": "Pass",
     "desc": "The month register and a child's attendance history were limited to the school admin and principal, so the class teacher's register page failed with 403.",
     "steps": "1. Sign in as the class teacher of Grade 3 A. 2. Open /attendance/student-attendance-register.",
     "expected": "The register for the teacher's own section loads.", "actual": "403 on /school/reports/attendance/student-monthly and /students/{id}.",
     "cause": "Endpoint allowed SchoolAdminOrPrincipal only.",
     "fix": "A teacher may read these for the section they are class teacher of (and its children) — no other section, school or role. Checked: own section 200; other section, other school, a non-class teacher and a parent all 403."},
    {"id": "DEF-003", "cases": ["FT-00897"], "title": "Teacher cannot see the attendance corrections they asked for",
     "module": "Student Attendance", "screen": "SCR-113 Attendance Correction; GET /school/attendance-ops/corrections",
     "sev": "Medium", "pri": "P2", "status": "Fixed", "retest": "Pass",
     "desc": "Teachers can ask for a register correction, but the list of corrections was limited to the admin and principal, so the page failed with 403 for a teacher.",
     "steps": "1. Sign in as a teacher. 2. Open /attendance/attendance-correction.",
     "expected": "The teacher sees the corrections they requested and their state.", "actual": "403 on GET /school/attendance-ops/corrections.",
     "cause": "Endpoint allowed SchoolAdminOrPrincipal only.",
     "fix": "A teacher now gets the corrections they requested; the admin and principal still see all and still decide. Parents and others: 403."},
    {"id": "DEF-004", "cases": ["FT-00185", "FT-00193", "FT-00201", "FT-00209", "FT-00217"], "title": "Test plan: SCR-024 to SCR-028 are assigned to Super Admin but are school admin screens",
     "module": "Organization / School / Branch Setup", "screen": "SCR-024 School Details, SCR-025 Branches List, SCR-026 Add Branch, SCR-027 Branch Details, SCR-028 Academic Year Setup",
     "sev": "Low", "pri": "P3", "status": "New", "retest": "Not Retested",
     "desc": "These screens work on the signed-in school's own records. The platform super admin has no school of their own (they manage schools from Organizations, SCR-010/012), so as written the cases cannot pass: the screens' data calls are refused (403).",
     "steps": "Run the smoke cases as written (Super Admin).",
     "expected": "The test cases name the role that uses the screen.", "actual": "As the super admin the data calls return 403; as the school admin every screen loads correctly.",
     "cause": "Persona in the test plan.", "fix": "Proposed: change the role of these five cases to School Admin. Consider also showing the super admin a plain 'this is a school's screen' message instead of 403 errors."},
    {"id": "DEF-005", "cases": ["FT-00905"], "title": "Test plan: SCR-114 Student Leave Requests is assigned to Teacher but is the parent's screen",
     "module": "Student Attendance", "screen": "SCR-114 Student Leave Requests",
     "sev": "Low", "pri": "P3", "status": "New", "retest": "Not Retested",
     "desc": "SCR-114 is where a parent asks for leave for their child (it reads /parent/me/children). Teachers decide leave on SCR-115 and in the teacher app, so as a teacher the screen's data calls are refused (403).",
     "steps": "Run FT-00905 as written (Teacher).",
     "expected": "The test case names the role that uses the screen.", "actual": "As a teacher: 403; as the parent the screen loads correctly.",
     "cause": "Persona in the test plan.", "fix": "Proposed: change the role of FT-00905 to Parent, and add a teacher case on SCR-115 Student Leave Approval."},
]
by_case = {c: d for d in DEFECTS for c in d["cases"]}

results = {r["id"]: r for r in json.load(open(os.path.join(HERE, "out", "results.json")))}


def actual_for(r):
    d = by_case.get(r["id"])
    text = r["actual"]
    if d and d["status"] == "Fixed":
        text = f"First run failed ({d['id']}: {d['title'][0].lower() + d['title'][1:]}); fixed and run again: {text}"
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

wb = openpyxl.load_workbook(EXT)
log = wb["Defect Log"]
hdr = {c.value: c.column for c in log[1]}
for i, d in enumerate(DEFECTS, start=2):
    fixed = d["status"] == "Fixed"
    values = {
        "Defect ID": d["id"], "Title": d["title"], "Module": d["module"], "Screen / API": d["screen"],
        "Found In Test Case": ", ".join(d["cases"]), "Severity": d["sev"], "Priority": d["pri"], "Status": d["status"],
        "Environment": ENV, "Description": d["desc"], "Steps to Reproduce": d["steps"], "Expected Result": d["expected"],
        "Actual Result": d["actual"], "Assigned To": "Development" if fixed else "QA Lead (test plan)",
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
