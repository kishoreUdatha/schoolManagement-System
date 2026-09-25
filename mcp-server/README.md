# School ERP MCP server

Exposes the school management system to MCP clients (Claude Desktop, Claude Code,
n8n's MCP Client node, …) so staff can work in plain language:

> "Mark Ravi and Priya absent in Grade 2 A today, everyone else present"
> "Set maths homework: exercise 5.2, due Friday, and tell the parents"
> "What's on my timetable tomorrow?" · "Draft a notice about Saturday's PTM"

It is a thin client of the backend REST API and logs in as a real school user, so
the backend's permission checks apply unchanged. A teacher login can only mark
attendance for their own sections, and so on.

## Tools

| Tool | Access | What it does |
|---|---|---|
| `whoami` | read | The logged-in user |
| `ask_school` | read | RAG answer from school documents, notices, holidays |
| `timetable_scope`, `section_timetable`, `teacher_timetable` | read | Timetables |
| `my_classes`, `get_attendance` | read | Teacher's sections, roster + marked attendance |
| `draft_from_note` | read | Free-text note → draft attendance + homework (AI) |
| `draft_notice` | read | Brief → notice title + body (AI) |
| `list_knowledge_documents` | read | Knowledge base |
| `save_attendance`, `create_homework`, `add_knowledge_document` | **write** | Saves real records; the server instructions tell the model to confirm first |

## Run

```bash
cd mcp-server
python -m venv .venv && .venv/bin/pip install -r requirements.txt
SMS_API_URL=http://127.0.0.1:8000 SMS_PORTAL=teacher \
SMS_EMAIL=teacher@school.test SMS_PASSWORD=... .venv/bin/python server.py
```

`SMS_PORTAL` is the login portal: `school` (admin), `principal`, `teacher` or `parent`.
Set `MCP_TRANSPORT=streamable-http` to serve over HTTP instead of stdio.

### Claude Desktop

```json
{
  "mcpServers": {
    "school-erp": {
      "command": "/path/to/mcp-server/.venv/bin/python",
      "args": ["/path/to/mcp-server/server.py"],
      "env": {
        "SMS_API_URL": "http://127.0.0.1:8000",
        "SMS_PORTAL": "teacher",
        "SMS_EMAIL": "teacher@school.test",
        "SMS_PASSWORD": "..."
      }
    }
  }
}
```

It lives outside `backend/` on purpose: `mcp` 2.x needs a newer Starlette than the
backend's FastAPI version supports, and keeping it separate means it can only do
what the logged-in user could do in the app.
