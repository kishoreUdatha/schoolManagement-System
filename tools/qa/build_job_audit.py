"""The job audit: every job in the permission matrix (web/src/lib/jobs.ts) must
open every screen its menu promises. For each job, a member of the office
staff is given one custom role carrying only that job's permissions (the job's
own and any extra an item needs), the way a school would set it up, and signs
in with their own password. Screens kept for some sign-in roles only
(ROLE_ONLY) are left out: staff are not shown them.

    python3 build_job_audit.py  ->  job_audit_accounts.json, job_audit_cases.json
"""
import json, os, re, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
API = os.environ.get("API", "http://127.0.0.1:8000/api/v1")
CODE = os.environ.get("CODE", "SUNQA").lower()
PASSWORD = "Office@2026"
from record_pages import RECORD  # noqa: E402

src = open(os.path.join(ROOT, "web/src/lib/jobs.ts")).read()
role_only = src[src.index("export const ROLE_ONLY"):src.index("export const usableBy")]
staff_barred = set()
for m in re.finditer(r"(\d+): \[([^\]]*)\]", role_only):
    if '"staff"' not in m.group(2):
        staff_barred.add(int(m.group(1)))
m = re.search(r"\[([\d,\s]+)\]\.map\(\(n\) => \[n, \[([^\]]*)\]\]\)", role_only)
if m and '"staff"' not in m.group(2):
    staff_barred |= {int(n) for n in m.group(1).split(",")}

jobs = []
body = src[src.index("export const JOBS"):src.index("const KEY")]
for block in re.split(r"\n  \{\n", body)[1:]:
    perm = re.search(r'permission: "([^"]+)"', block).group(1)
    title = re.search(r'title: "([^"]+)"', block).group(1)
    items = [(int(n), label, extra) for n, label, extra in re.findall(r'\[(\d+), "([^"]+)"(?:, "([^"]+)")?\]', block)]
    jobs.append((perm, title, items))

routes = {}
for m in re.finditer(r'"id": "SCR-(\d+)".*?"route": "([^"]+)"', open(os.path.join(ROOT, "web/src/lib/screens.ts")).read()):
    routes[int(m.group(1))] = m.group(2)
for m in re.finditer(r'\[(\d+), "[^"]*", "\w+", "[^"]*", "\w+", "([^"]+)"\]', open(os.path.join(ROOT, "web/src/lib/extraScreens.ts")).read()):
    routes[int(m.group(1))] = m.group(2)


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path}: {e.code} {e.read()[:300]}") from None


acc_file = os.path.join(HERE, "job_audit_accounts.json")
accounts = json.load(open(acc_file)) if os.path.exists(acc_file) else {}
admin = None
roles = None
for perm, title, items in jobs:
    perms = sorted({perm} | {e for _, _, e in items if e})
    if perm in accounts and accounts[perm]["permissions"] == perms:
        continue
    admin = admin or call("POST", "/school/auth/login", body={"email": f"admin@{CODE}.test", "password": "Sunrise@2026"})["access_token"]
    roles = roles or {r["code"]: r for r in call("GET", "/school/roles", admin)}
    slug = perm.replace(".", "_")
    if perm in accounts:  # the job changed in jobs.ts: change their role to match
        role = roles[f"audit_{slug}"]
        call("PUT", f"/school/roles/{role['id']}", admin, {"name": role["name"], "code": role["code"], "base_role": "staff", "permissions": perms})
        accounts[perm]["permissions"] = perms
        json.dump(accounts, open(acc_file, "w"), indent=1)
        continue
    email = f"job.{slug.replace('_', '-')}@{CODE}.test"
    try:
        made = call("POST", "/school/staff", admin, {"full_name": f"Audit {title}", "email": email, "role": "staff", "designation": f"{title} (audit)"})
        user_id, temp = made["staff"]["user_id"], made["temporary_password"]
    except RuntimeError as e:
        if ": 409 " not in str(e):
            raise
        # made on an interrupted run: give them a fresh temporary password
        staff = next(x for x in call("GET", f"/school/staff?search={email}", admin) if x["email"] == email)
        user_id, temp = staff["user_id"], call("POST", f"/school/staff/{staff['id']}/reset-password", admin)["temporary_password"]
    code = f"audit_{slug}"
    role = roles.get(code) or call("POST", "/school/roles", admin, {"name": f"Audit: {title}", "code": code, "base_role": "staff", "permissions": perms})
    try:
        call("POST", "/school/role-assignments", admin, {"user_id": user_id, "role_id": role["id"]})
    except RuntimeError as e:
        if "already has" not in str(e):
            raise
    tok = call("POST", "/staff/auth/login", body={"email": email, "password": temp})["access_token"]
    call("POST", "/account/change-password", tok, {"current_password": temp, "new_password": PASSWORD})
    accounts[perm] = {"email": email, "password": PASSWORD, "job": title, "permissions": perms}
    json.dump(accounts, open(acc_file, "w"), indent=1)

cases = []
for perm, title, items in jobs:
    for n, label, extra in items:
        if n in staff_barred:
            continue
        scr = f"SCR-{n:03d}"
        cases.append({"id": f"JOB-{perm}-{n}", "scr": scr, "name": f"{title}: {label}", "job": perm,
                      "path": routes[n], "record": RECORD.get(scr), "cross_school": RECORD.get(scr) is not None})
json.dump(cases, open(os.path.join(HERE, "job_audit_cases.json"), "w"), indent=1)
print(len(jobs), "jobs,", len(cases), "screens;", "left out for staff:", sorted(staff_barred))
