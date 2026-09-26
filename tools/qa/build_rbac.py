"""Read the RBAC Tests sheet (two cases per screen) and decide how to run each.

Authorized access: the account holding the screen's role opens it (as in the
smoke run). Unauthorized access: a signed-in user who must not have the
screen opens it directly, and every API answer is watched — the screen's data
calls must be refused and no protected data returned:
  - platform (super admin) screens: a school admin tries them;
  - the parent's own screens: a teacher tries them;
  - every other school screen, including teacher and student ones: a parent.
Public screens (All Users) have nothing to protect: Not Applicable.

    python3 build_rbac.py  ->  rbac_cases.json
"""
import json, os, re
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
EXT = os.path.join(ROOT, "School_ERP_Functional_Testing_Extended_Coverage.xlsx")

ACCOUNT = {
    "All Users": "public", "Super Admin": "super_admin",
    "School Admin": "school_admin", "Academic Coordinator": "school_admin", "IT Admin": "school_admin",
    # the app's Examinations and Admissions jobs, held by office staff (tools/qa/jobs.py)
    "Exam Coordinator": "exams", "Admission Officer": "admissions",
    "HR": "hr", "Transport Manager": "transport", "Nurse / Medical Officer": "nurse",
    "Librarian": "staff", "Store Manager": "staff", "Security": "staff", "Hostel Warden": "staff",
    "Teacher": "teacher", "Class Teacher": "teacher", "Accountant": "accountant", "Principal": "principal",
    "Student": "student", "Parent": "parent_web",
}
# Pages about one record (?id=): which record of the test school opens them.
RECORD = {
    "SCR-012": "tenant", "SCR-027": "branch", "SCR-046": "enquiry",
    **{f"SCR-0{n}": "student" for n in range(57, 69)},
    "SCR-073": "parent", "SCR-074": "parent", "SCR-076": "parent", "SCR-079": "parent",
    "SCR-082": "staff", "SCR-083": "staff", "SCR-099": "class_subject", "SCR-130": "homework", "SCR-248": "event",
}
# Screens whose persona in the plan is not the one that uses them in this
# build: run as the role that does, reported Blocked with the reason.
SETUP = ("The plan lists Super Admin, but this screen works on the signed-in school's own records; the platform "
         "team has no school of its own and manages schools from Organizations (SCR-010/012). As the super admin "
         "the screen's data calls are refused (403).")
MISMATCH = {
    **{f"SCR-0{n}": ("school_admin", SETUP) for n in range(24, 33)},
    "SCR-114": ("parent_web", "The plan lists Teacher, but SCR-114 is the parent's form for asking leave for their child; "
                "teachers decide leave on SCR-115 and in the teacher app. As a teacher its data calls are refused (403)."),
    "SCR-116": ("school_admin", "The plan lists Teacher, but SCR-116 is the office's review of late arrivals and early "
                "exits across the school (admin and principal); teachers record lateness on the register. As a teacher "
                "its data calls are refused (403)."),
    "SCR-146": ("exams", "The plan lists Teacher, but practical/internal marks are part of the Examinations job "
                "(exams.manage), not every teacher's; teachers enter marks on SCR-145 and in the teacher app. As a "
                "plain teacher its data calls are refused (403)."),
    "SCR-148": ("exams", "The plan lists Teacher, but marks sign-off belongs to the Examinations job and is by design "
                "never done by the person who entered the marks. As a plain teacher its data calls are refused (403)."),
    "SCR-223": ("discipline", "The plan lists Nurse / Medical Officer, but discipline incidents are the Discipline job "
                "(discipline.manage), not the clinic's. As the nurse its data calls are refused (403)."),
    "SCR-224": ("discipline", "The plan lists Nurse / Medical Officer, but incident follow-up is the Discipline job "
                "(discipline.manage), not the clinic's. As the nurse its data calls are refused (403)."),
    "SCR-258": ("school_admin", "The plan lists HR, but the document register (student and staff papers, certificates) "
                "is kept by the office; it is not part of the Recruitment & HR job. As HR its data calls are refused (403)."),
}
ALL_SCHOOLS = {"SCR-012"}  # the super admin sees every tenant by design
# Parents have no web workspace: these screens are the parent app's.
PARENT_APP = {"SCR-037": "/parent/home", "SCR-159": "/parent/fees", "SCR-160": "/parent/payments-receipts"}

routes = {}
src = open(os.path.join(ROOT, "web/src/lib/screens.ts")).read()
for m in re.finditer(r'"id": "(SCR-\d+)".*?"module": "([^"]*)".*?"route": "([^"]+)"', src):
    routes[m.group(1)] = (m.group(3), m.group(2))

wb = openpyxl.load_workbook(EXT, read_only=True)
cases, pending = [], {}
for r in wb["RBAC Tests"].iter_rows(min_row=2, values_only=True):
    if not r[0]:
        continue
    tid, module, scr, name, scenario, role = r[:6]
    path, _ = routes[scr]
    if scenario.startswith("Authorized"):
        acct = ACCOUNT[role]
        if acct == "parent_web" and scr in PARENT_APP:
            acct, path = "parent", PARENT_APP[scr]
        run_as, mismatch = MISMATCH.get(scr, (acct, None))
        pending[scr] = run_as
        cases.append({"id": tid, "scr": scr, "name": name, "module": module, "scenario": "authorized", "role": role,
                      "account": run_as, "plan_account": acct, "mismatch": mismatch, "path": path, "record": RECORD.get(scr),
                      "cross_school": RECORD.get(scr) is not None and scr not in ALL_SCHOOLS})
    else:
        owner = pending.get(scr)
        if owner == "public":
            attacker = None
        elif owner == "super_admin" or module.startswith("Super Admin"):
            attacker = "school_admin"
        elif owner in ("parent_web", "parent"):
            attacker = "teacher"
        else:
            attacker = "parent_web"
        cases.append({"id": tid, "scr": scr, "name": name, "module": module, "scenario": "unauthorized", "role": role,
                      "owner": owner, "account": attacker, "path": PARENT_APP.get(scr, path) if owner == "parent" else path,
                      "record": RECORD.get(scr)})
json.dump(cases, open(os.path.join(HERE, "rbac_cases.json"), "w"), indent=1)
auth = [c for c in cases if c["scenario"] == "authorized"]
print(len(cases), "cases:", len(auth), "authorized,", len(cases) - len(auth), "unauthorized")
print("authorized as:", {a: sum(1 for c in auth if c["account"] == a) for a in sorted({c["account"] for c in auth})})
print("attacked by:", {a: sum(1 for c in cases if c["scenario"] == "unauthorized" and c["account"] == a) for a in sorted({str(c["account"]) for c in cases if c["scenario"] == "unauthorized"}, key=str)})
