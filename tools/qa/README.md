# Smoke run of the functional test plan

Runs the 100 cases of the **Smoke Suite** in `School_ERP_Functional_Test_Plan_and_Cases.xlsx`
against the live app and writes the results back into the workbooks.

Every smoke case is "authorized access to <screen>". For each one, the runner signs in
as the account that holds the case's role, opens the screen, and records a failure for
any API error, page error, error message, missing page or bounce to sign-in. The screen
must not show any person or the name of a **second school** on the platform, and a
screen about one record (a student, a staff member, an enquiry…) is also opened with the
second school's record, which must be refused with no data served.

Personas the app does not have as sign-ins (coordinators, IT admin) are run as the
school admin, who holds those duties. Where the plan named a role that does not use a
screen at all, `fix_personas.py` corrected the plan (DEF-004, 005, 009); `MISMATCH` in
the build scripts can still run such a case as the right role and report it **Blocked**.

```bash
# the app running (API :8000, web :3100), then a school built by the demo story
# and the dev seed school as the second school:
cd tools/demo-video && CODE=SUNQA TTS_PROVIDER=silent node demo.js
cd ../../backend && python -m scripts.seed_dev_school && python -m scripts.seed_dev_data

cd ../tools/qa
python3 build_cases.py        # the Smoke Suite -> cases.json (account, page, record)
python3 records.py            # records in both schools -> records.json
node smoke.js                 # -> out/results.json, out/evidence/<case>.png
python3 write_results.py      # -> Status / Actual Result / Defect ID / Tester in the workbooks
```

`write_results.py` writes the Defect Log from `defects.py` (what both runs found).

# RBAC run

Runs the 590 cases of the **RBAC Tests** sheet in `School_ERP_Functional_Testing_Extended_Coverage.xlsx`
(two per screen). *Authorized access* is checked as in the smoke run. *Unauthorized access*:
a signed-in user who must not have the screen opens it directly (with a real record of
their school where the page takes one) while every API answer is watched; it passes when
the screen's protected calls are refused and no protected data or people reach the page.
Platform screens are attempted by a school admin, the parent's screens by a teacher, and
every other school screen by a parent. Public pages are Not Applicable.

The jobs a school gives office staff through custom roles (HR, transport, nurse,
admissions, examinations, discipline) are signed in as real staff holding only that
job's permissions, made by `jobs.py`.

```bash
python3 jobs.py               # office staff with one job each -> jobs.json
python3 build_rbac.py         # the RBAC Tests sheet -> rbac_cases.json
node rbac.js [case ids]       # -> out/rbac_results.json (ids: rerun just those), out/rbac_evidence/
python3 write_rbac.py         # -> Status / Actual Result / Defect ID / Tester / Evidence
python3 write_results.py      # refresh the Defect Log with the RBAC cases
```

# Job audit

The permission matrix (web/src/lib/jobs.ts) promises each job a set of screens. For
every job, an office staff member is given one custom role with only that job's
permissions, and:

- `job_audit.js` opens every screen the job's menu shows (as in the smoke run);
- `job_doors.py` reads each screen's code for every API call it can make — saves and
  actions included — and runs that endpoint's guard as the job holder (the guard only:
  nothing is read or written). Calls that stay with another role on purpose are listed
  in `BY_DESIGN` with the reason.

```bash
python3 build_job_audit.py    # accounts per job -> job_audit_accounts.json, job_audit_cases.json
node job_audit.js [jobs]      # -> out/job_audit_results.json, out/job_evidence/
cd ../../backend && PYTHONPATH=. python ../tools/qa/job_doors.py   # -> out/job_doors.json
```

(The test school needs a plan allowing more than 20 staff for the audit accounts.)
