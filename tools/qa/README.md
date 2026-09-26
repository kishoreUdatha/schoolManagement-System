# Smoke run of the functional test plan

Runs the 100 cases of the **Smoke Suite** in `School_ERP_Functional_Test_Plan_and_Cases.xlsx`
against the live app and writes the results back into the workbooks.

Every smoke case is "authorized access to <screen>". For each one, the runner signs in
as the account that holds the case's role, opens the screen, and records a failure for
any API error, page error, error message, missing page or bounce to sign-in. The screen
must not show any person or the name of a **second school** on the platform, and a
screen about one record (a student, a staff member, an enquiry…) is also opened with the
second school's record, which must be refused with no data served.

Personas the app does not have as sign-ins (coordinators, IT admin, admission officer)
are run as the school admin, who holds those duties. Cases whose persona does not use the
screen at all are run as the role that does and reported as **Blocked** with the reason,
so the plan can be corrected rather than the result hidden.

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

`write_results.py` also holds the Defect Log entries for what the run found.
