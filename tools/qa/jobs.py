"""Office staff for the RBAC run whose job is not one the built-in staff role
already carries: HR, transport and the school nurse. Each is created as plain
office staff and given one custom role with only that job's permissions, the
way a school would set it up (Users & roles), then sets their own password.

(The built-in staff role already carries the library, front desk, store and
hostel jobs: Suresh, the librarian from the demo story, covers those.)

    python3 jobs.py   ->  jobs.json (emails and passwords)
"""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
API = os.environ.get("API", "http://127.0.0.1:8000/api/v1")
CODE = os.environ.get("CODE", "SUNQA").lower()
PASSWORD = "Office@2026"
JOBS = {
    "hr": ("Priya Nair", "HR Manager", "hr_manager", ["hr.manage", "payroll.manage", "staff.manage"]),
    "transport": ("Arun Kumar", "Transport Manager", "transport_manager", ["transport.manage"]),
    "nurse": ("Mary Thomas", "School Nurse", "school_nurse", ["health.manage", "counselling.access"]),
    "admissions": ("Ravi Menon", "Admission Officer", "admission_officer", ["admissions.manage", "admissions.decide"]),
    "exams": ("Sunita Rao", "Exam Coordinator", "exam_coordinator", ["exams.manage", "grading.manage", "exams.approve_results"]),
    "discipline": ("Vikas Gupta", "Discipline In-charge", "discipline_incharge", ["discipline.manage"]),
}


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path}: {e.code} {e.read()[:300]}") from None


admin = call("POST", "/school/auth/login", body={"email": f"admin@{CODE}.test", "password": "Sunrise@2026"})["access_token"]
roles = {r["code"]: r for r in call("GET", "/school/roles", admin)}
out = json.load(open(os.path.join(HERE, "jobs.json"))) if os.path.exists(os.path.join(HERE, "jobs.json")) else {}
for key, (name, title, code, perms) in JOBS.items():
    if key in out and (len(sys.argv) < 2 or key not in sys.argv[1:]):
        continue  # made on an earlier run
    email = f"{key}@{CODE}.test"
    made = call("POST", "/school/staff", admin, {"full_name": name, "email": email, "role": "staff", "designation": title})
    user_id = made["staff"]["user_id"]
    role = roles.get(code) or call("POST", "/school/roles", admin, {"name": title, "code": code, "base_role": "staff", "permissions": perms})
    call("POST", "/school/role-assignments", admin, {"user_id": user_id, "role_id": role["id"]})
    tok = call("POST", "/staff/auth/login", body={"email": email, "password": made["temporary_password"]})["access_token"]
    call("POST", "/account/change-password", tok, {"current_password": made["temporary_password"], "new_password": PASSWORD})
    out[key] = {"email": email, "password": PASSWORD, "name": name, "job": title, "permissions": perms}
json.dump(out, open(os.path.join(HERE, "jobs.json"), "w"), indent=1)
print(json.dumps(out, indent=1))
