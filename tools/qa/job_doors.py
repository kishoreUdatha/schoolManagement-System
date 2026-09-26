"""The job audit's second half: every button, not just every page load.

For each job screen (job_audit_cases.json), collect the API calls its page's
code makes (the page file and the feature files it imports, so a little more
than the screen itself), and ask each endpoint's guard whether the job's
holder (job_audit_accounts.json) gets through. Only the guard runs: nothing is
read or written. Reported: every call a job holder is refused.

    PYTHONPATH=../../backend python job_doors.py  ->  out/job_doors.json
"""
import inspect, json, os, re, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
WEB = os.path.join(ROOT, "web", "src")
sys.path.insert(0, os.path.join(ROOT, "backend"))

from fastapi import HTTPException  # noqa: E402
from fastapi.routing import APIRoute  # noqa: E402
from sqlalchemy import select  # noqa: E402

import logging  # noqa: E402

from app.core.deps import get_current_user  # noqa: E402
from app.database import SessionLocal, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402

CALL = re.compile(r'(useApi|api\.(get|post|put|patch|delete|download|upload))\s*(?:<(?:[^()]|<[^>]*>)*?>)?\(\s*[`"](/api/v1/[^`"]+)[`"]')
IMPORT = re.compile(r'from "@/(features/[^"]+)"')
METHOD = {"get": "GET", "download": "GET", "upload": "POST", None: "GET"}


def page_file(path):
    hits = [os.path.join(dp, "page.tsx") for dp, _, fs in os.walk(os.path.join(WEB, "app"))
            if "page.tsx" in fs and dp.replace("\\", "/").endswith(path)]
    return next((h for h in hits if "(screens)" in h), hits[0] if hits else None)


def source(mod):
    for ext in (".tsx", ".ts", "/index.tsx", "/index.ts"):
        f = os.path.join(WEB, mod + ext)
        if os.path.exists(f):
            return f


def calls_of(page):
    files, todo, seen = [], [page], set()
    while todo:  # the page, its feature files and theirs
        f = todo.pop()
        if not f or f in seen:
            continue
        seen.add(f)
        files.append(f)
        text = open(f).read()
        todo += [source(m) for m in IMPORT.findall(text) if not m.endswith(("/kit", "/parts"))]
    out = set()
    for f in files:
        for m in CALL.finditer(open(f).read()):
            method = METHOD.get(m.group(2), (m.group(2) or "get").upper())
            url = re.sub(r"\$\{[^}]*\}", "{}", m.group(3).split("?")[0]).rstrip("/")
            if not re.match(r"/api/v1/(\{\}|[\w-]+/\{\})", url):  # the service itself templated: unknown
                out.add((method, url, os.path.relpath(f, WEB)))
    return out


routes = []
for r in app.routes:
    if isinstance(r, APIRoute):
        rx = re.compile("^" + re.sub(r"\\\{[^}]+\\\}", r"[^/]+", re.escape(r.path)) + "$")
        routes.append((r, rx))


def route_for(method, url):
    probe = url.replace("{}", "1")
    exact = [r for r, rx in routes if method in r.methods and rx.match(probe)]
    # a literal segment beats a {param}
    return min(exact, key=lambda r: r.path.count("{"), default=None)


def admits(route, user, db):
    """Run the route's guard dependencies with this user."""
    def solve(dep):
        kwargs = {}
        for sub in dep.dependencies:
            if sub.call is get_current_user:
                kwargs[sub.name] = user
            elif sub.call is get_db:
                kwargs[sub.name] = db
            else:
                kwargs[sub.name] = solve(sub)
                if kwargs[sub.name] is _SKIP:
                    return _SKIP
        if dep.call is None:
            return None
        params = inspect.signature(dep.call).parameters
        if any(p not in kwargs and v.default is inspect.Parameter.empty for p, v in params.items()):
            return _SKIP  # needs request data (a body, a query): not a guard
        return dep.call(**{k: v for k, v in kwargs.items() if k in params})
    try:
        for sub in route.dependant.dependencies:
            if sub.call not in (get_db,):
                solve(sub)
        return True, ""
    except HTTPException as e:
        return False, f"{e.status_code} {e.detail}"


# Calls a job's screens make that stay with another job or role on purpose.
# (method, path) -> why; they are listed apart and are not failures.
BY_DESIGN = {
    ("POST", "/api/v1/school/sections/{section_id}/timetable/copy"): "building the timetable is the office's (settings), not the cover job's",
    ("PUT", "/api/v1/school/sections/{section_id}/timetable/{period_id}"): "building the timetable is the office's (settings), not the cover job's",
    ("DELETE", "/api/v1/school/sections/{section_id}/timetable/{period_id}"): "building the timetable is the office's (settings), not the cover job's",
    ("POST", "/api/v1/school/fees/refunds"): "raising a refund is fees.refund.request, apart from approving it",
    ("POST", "/api/v1/school/fees/refunds/{refund_id}/process"): "paying a refund out is the accountant's",
    ("POST", "/api/v1/school/academic-years"): "setting up years, classes and sections is the office's (settings)",
    ("POST", "/api/v1/school/classes"): "setting up years, classes and sections is the office's (settings)",
    ("POST", "/api/v1/school/classes/{class_id}/sections"): "setting up years, classes and sections is the office's (settings)",
    ("POST", "/api/v1/school/fees/reminders/run"): "sending fee reminders to every family is the accounts office's",
    ("GET", "/api/v1/school/payroll/runs"): "payroll figures are the payroll job's",
    ("POST", "/api/v1/school/report-definitions"): "saving a report for the whole school is the admin's; running one is not",
    ("PATCH", "/api/v1/school/report-definitions/{report_id}"): "saving a report for the whole school is the admin's; running one is not",
    ("DELETE", "/api/v1/school/report-definitions/{report_id}"): "saving a report for the whole school is the admin's; running one is not",
    ("GET", "/api/v1/school/exam-ops/rooms"): "called by the exam screens that share a file with the cover board",
}
_SKIP = object()
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
cases = json.load(open(os.path.join(HERE, "job_audit_cases.json")))
accounts = json.load(open(os.path.join(HERE, "job_audit_accounts.json")))
only = sys.argv[1:]
db = SessionLocal()
db.get_bind().echo = False
refused, unmatched, by_design = [], set(), set()
for c in cases:
    if only and c["job"] not in only:
        continue
    user = db.execute(select(User).where(User.email == accounts[c["job"]]["email"])).scalar_one()
    page = page_file(c["path"])
    for method, url, where in sorted(calls_of(page) if page else []):
        if not url.startswith("/api/v1/school") and not url.startswith("/api/v1/staff"):
            continue
        r = route_for(method, url)
        if not r:
            unmatched.add((method, url))
            continue
        ok, why = admits(r, user, db)
        if not ok and (method, r.path) in BY_DESIGN:
            by_design.add((c["job"], method, r.path, BY_DESIGN[(method, r.path)]))
        elif not ok:
            refused.append({"job": c["job"], "screen": c["scr"], "name": c["name"], "method": method, "path": r.path, "file": where, "why": why})
db.close()
json.dump(refused, open(os.path.join(HERE, "out", "job_doors.json"), "w"), indent=1)
by = defaultdict(set)
for x in refused:
    by[x["job"]].add((x["method"], x["path"], x["why"][:60]))
for job, doors in by.items():
    print(f"== {job}: {len(doors)} refused")
    for d in sorted(doors, key=lambda d: d[1]):
        print("  ", *d)
print(len({(x['job'], x['method'], x['path']) for x in refused}), "refused (job, call);", len(by_design), "by design;", len(unmatched), "calls not matched to a route")
