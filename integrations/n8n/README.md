# n8n automations

Import these into n8n (**Workflows → Import from file**). Both log in to the
backend as a school admin and call the normal REST API, so all validation applies.

| Workflow | Trigger | What it saves you |
|---|---|---|
| `admission-form-to-students.json` | New rows in a Google Sheet (e.g. linked to a Google Form admission form) | AI reads each row, whatever the column names, and bulk-imports the students into an "admissions" section. No retyping forms. |
| `circulars-to-knowledge-base.json` | Unread emails with "Circular" in the subject | Adds each circular to the AI knowledge base, so the "Ask the school" assistant can answer parents about it right away. |

## Environment variables (set on the n8n container)

| Variable | Used by | Example |
|---|---|---|
| `SMS_API_URL` | both | `http://backend:8000` |
| `SMS_ADMIN_EMAIL`, `SMS_ADMIN_PASSWORD` | both | a school-admin login |
| `SMS_ADMISSIONS_YEAR_ID`, `SMS_ADMISSIONS_SECTION_ID` | admissions | ids of the year and the holding section new admissions go into |

After importing, open the trigger node and pick your Google Sheets / IMAP
credentials and the sheet URL. The admissions workflow imports straight into
the holding section; move students to their real sections from the Students page.

`docker compose --profile automation up -d n8n` starts n8n on http://localhost:5678
with these variables wired from `.env`.

Note: these files follow n8n's workflow export format (HTTP Request node v4.2,
Code node v2). They weren't run against a live n8n instance here, so check the
trigger nodes after import.
