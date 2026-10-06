"""Records the smoke run opens by id, in the test school and in a second school.

The test school is the one the demo story builds (CODE, default SUNQA); the
second school is the dev seed's (school@sms.local). Records the story does not
make (an enquiry, an event, a branch) are created here through the API, the
rest are looked up. Also lists the second school's people and name: none of
them may appear on any page the test school's users open.

    python3 records.py  ->  records.json
"""
import json, os, subprocess, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
API = os.environ.get("API", "http://127.0.0.1:8000/api/v1")
CODE = os.environ.get("CODE", "SUNQA")
SCHOOLS = {
    "own": (f"admin@{CODE.lower()}.test", "Sunrise@2026"),
    "other": ("school@sms.local", "SchoolPass123!"),
}


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "null")


def sql(q):
    out = subprocess.run(["psql", "-h", "localhost", "-U", "sms", "-d", "erp", "-Atc", q], capture_output=True, text=True, check=True).stdout
    return [line.split("|") for line in out.strip().splitlines() if line]


def items(x):
    return x["items"] if isinstance(x, dict) and "items" in x else x


records, school_ids = {}, {}
for key, (email, password) in SCHOOLS.items():
    tok = call("POST", "/school/auth/login", body={"email": email, "password": password})["access_token"]
    me = call("GET", "/school/profile", tok)
    sid = me["id"]
    school_ids[key] = sid
    r = {"school_id": sid, "school_name": me["name"]}
    r["student"] = items(call("GET", "/school/students?page_size=5", tok))[0]["id"]
    r["parent"] = items(call("GET", "/school/parents?page_size=5", tok))[0]["user_id"]
    r["staff"] = items(call("GET", "/school/staff?page_size=5", tok))[0]["id"]
    r["enquiry"] = call("POST", "/school/admissions/enquiries", tok, {"student_name": f"QA Enquiry {key}", "parent_name": "QA Parent", "parent_phone": "9800000000"})["id"]
    r["event"] = call("POST", "/school/events", tok, {"title": f"QA Sports Day {key}", "start_date": "2026-11-14"})["id"]
    r["branch"] = call("POST", "/school/branches", tok, {"name": f"QA Branch {key}", "code": f"QA{key[:1].upper()}{os.getpid() % 10000}"})["id"]
    rows = sql(f"select id from class_subjects where school_id={sid} order by id limit 1")
    r["class_subject"] = int(rows[0][0]) if rows else None
    rows = sql(f"select id from homework where school_id={sid} order by id limit 1")
    r["homework"] = int(rows[0][0]) if rows else None
    r["tenant"] = int(sql(f"select tenant_id from schools where id={sid}")[0][0])
    records[key] = r

# The second school's people: none of these may show up for the test school.
other = school_ids["other"]
names = [n for (n,) in sql(f"select full_name from users where school_id={other} and full_name is not null")]
names += [n for (n,) in sql(f"select full_name from students where school_id={other}")]
# Names the web app itself uses as placeholder text are not evidence of a leak.
web = ""
for base, _, files in os.walk(os.path.join(HERE, "..", "..", "web", "src")):
    for f in files:
        if f.endswith((".ts", ".tsx")):
            web += open(os.path.join(base, f), encoding="utf-8").read()
watch = {n.strip() for n in names if len(n.strip()) > 5} | {records["other"]["school_name"]}
records["leak_names"] = sorted(n for n in watch if n not in web)
records["ignored_placeholder_names"] = sorted(n for n in watch if n in web)
json.dump(records, open(os.path.join(HERE, "records.json"), "w"), indent=1)
print(json.dumps({k: v for k, v in records.items() if k != "leak_names"}, indent=1), len(records["leak_names"]), "names to watch for")
