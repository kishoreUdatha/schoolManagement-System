"""Read the Smoke Suite from the functional test plan and turn each case into
something the runner can do: which account signs in, which page it opens, and
(for a page about one record) which record, so the same page can also be
tried with another school's record.

    python3 build_cases.py  ->  cases.json
"""
import json, os, re
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PLAN = os.path.join(ROOT, "School_ERP_Functional_Test_Plan_and_Cases.xlsx")

# The plan's personas, and the account in the test school that holds each job.
# Coordinators, the IT admin and the admission officer are duties of the
# school admin in this build, not separate sign-ins.
ACCOUNT = {
    "User": "public", "Platform": "super_admin", "Super Admin": "super_admin",
    "School Admin": "school_admin", "Academic Coordinator": "school_admin", "Exam Coordinator": "school_admin",
    "Timetable": "school_admin", "Exam": "school_admin", "Executive Analytics": "school_admin",
    "Admission Officer": "school_admin", "Admission / Enquiry": "school_admin", "IT Admin": "school_admin",
    "Principal": "principal", "Teacher": "teacher", "Class Teacher": "teacher",
    "Accountant": "accountant", "Fee": "accountant", "Student": "student", "Parent": "parent",
    "Discipline In-charge": "school_admin",
}
# Parents have no web workspace: these screens are the parent app's.
PARENT_APP = {"SCR-037": "/parent/home", "SCR-159": "/parent/fees", "SCR-160": "/parent/payments-receipts"}
# Pages about one record (?id=): which record of the test school opens them.
RECORD = {
    "SCR-012": "tenant", "SCR-027": "branch", "SCR-046": "enquiry", "SCR-057": "student", "SCR-058": "student",
    "SCR-059": "student", "SCR-060": "student", "SCR-061": "student", "SCR-062": "student",
    "SCR-073": "parent", "SCR-074": "parent", "SCR-082": "staff", "SCR-083": "staff",
    "SCR-099": "class_subject", "SCR-130": "homework", "SCR-248": "event",
}
# Screens whose persona in the plan is not the one that uses them in this
# build: run as the role that does and reported Blocked with the reason, so the
# plan is corrected rather than the result hidden. (None now: fix_personas.py
# corrected the plan.) {"SCR-...": ("account", "reason")}
MISMATCH = {}
# Records the super admin may see in every school, so no cross-school check.
ALL_SCHOOLS = {"SCR-012"}

routes = {}
src = open(os.path.join(ROOT, "web/src/lib/screens.ts")).read()
for m in re.finditer(r'"id": "(SCR-\d+)".*?"role": "([^"]*)".*?"route": "([^"]+)"', src):
    routes[m.group(1)] = m.group(3)

wb = openpyxl.load_workbook(PLAN, read_only=True)
cases = []
for r in wb["Smoke Suite"].iter_rows(min_row=2, values_only=True):
    if not r[0]:
        continue
    tid, module, scr, name, _story, _ac, role = r[:7]
    acct = ACCOUNT[role]
    if acct == "parent" and scr not in PARENT_APP:
        acct = "parent_web"  # a parent's web page (asking leave for a child)
    path = PARENT_APP.get(scr) if acct == "parent" else routes[scr]
    run_as, mismatch = MISMATCH.get(scr, (acct, None))
    cases.append({
        "id": tid, "scr": scr, "name": name, "module": module, "role": role, "account": run_as, "plan_account": acct, "mismatch": mismatch, "path": path,
        "record": RECORD.get(scr), "cross_school": RECORD.get(scr) is not None and scr not in ALL_SCHOOLS,
    })
json.dump(cases, open(os.path.join(HERE, "cases.json"), "w"), indent=1)
print(len(cases), "cases;", sum(1 for c in cases if c["record"]), "about one record")
