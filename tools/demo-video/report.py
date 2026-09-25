"""tour/report.json as a readable test report (Markdown), on stdout."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "tour", "report.json")))
total = sum(len(r.get("screens", [])) for r in R.values())
bad = sum(len(r.get("problems", [])) for r in R.values())
print("# BrightCampus: every menu, every role\n")
print(f"{total} screens opened across {len(R)} roles and apps; {bad} problems.\n")
print("| Role | Screens | Problems |\n|---|---|---|")
for r in R.values():
    print(f"| {r.get('title', '?')} | {len(r.get('screens', []))} | {len(r.get('problems', []))} |")
for r in R.values():
    print(f"\n## {r.get('title', '?')}\n")
    for p in r.get("problems", []):
        print(f"- **{p['kind']}** at {p['where']}: `{p['detail']}`")
    print("\n| # | Menu | Screen | Page title | OK |\n|---|---|---|---|---|")
    for i, s in enumerate(r.get("screens", []), 1):
        where = " › ".join(x for x in (s.get("group"), s["label"]) if x)
        print(f"| {i} | {where} | {s.get('scr') or s['href']} | {s.get('title') or ''} | {'✗' if s.get('problems') else '✓'} |")
