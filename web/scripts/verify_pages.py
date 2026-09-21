"""Check every built page against its mock, markup for markup.

Run after `npm run build`. Reads the prerendered HTML Next wrote under
.next/server/app and the mock's screens/*.html, maps app routes back to mock
file names, and compares the two bodies after normalising what legitimately
differs (React's text separators, attribute order, class spacing, 84% vs
84.0%). Prints each screen that differs and the first point of difference.
"""
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

sys.argv = sys.argv[:1]
import build_pages as B  # noqa: E402

NEXT = B.WEB / ".next/server/app"
TO_MOCK = {B.ROUTE[s["id"]]: B.G.filename(s) for s in B.SCREENS}
TO_MOCK["/screens"] = "../index.html"


def canon(el, out, depth=0):
    if isinstance(el, Comment):
        return
    if isinstance(el, NavigableString):
        t = re.sub(r"\s+", " ", str(el))
        if t.strip():
            out.append(("T", t.strip()))
        return
    if not isinstance(el, Tag) or el.name in ("script", "template", "noscript"):
        return
    attrs = {}
    for k, v in el.attrs.items():
        if isinstance(v, list):
            v = " ".join(x for x in v if x)
        v = v.strip()
        if k == "href":
            path, _, q = v.partition("?")
            v = TO_MOCK.get(path, v)
            if v == "../index.html" and q:
                v += "?" + q
        if k in ("data-role-target", "value") and v in TO_MOCK:
            v = TO_MOCK[v]
        if k == "style":
            v = ";".join(sorted(re.sub(r"(\d+)\.0(%|px)", r"\1\2", d).replace(" ", "") for d in v.split(";") if d.strip()))
        if el.name in ("rect", "polygon", "polyline", "circle", "text", "path"):
            v = re.sub(r"(\d+)\.0(?!\d)", r"\1", v)
        if k in ("selected",):
            continue
        if k == "value" and el.name in ("input", "textarea"):
            pass
        attrs[k] = v
    out.append(("<", el.name, tuple(sorted(attrs.items()))))
    for c in el.children:
        canon(c, out, depth + 1)
    out.append((">", el.name))


def tokens(html, strip_chrome):
    soup = BeautifulSoup(html, "html.parser")
    body = soup.body
    for el in body.find_all(id=["toast", "modal"]):
        el.decompose()
    for el in body.find_all(["script", "next-route-announcer"]):
        el.decompose()
    # Deliberate departure: the school card moved from the sidebar to the top bar.
    # ...and the menu lists every module's screens in collapsible groups.
    for el in body.select(".sidebar .nav-scroll, .sidebar-footer, .screen-note"):
        el.decompose()
    for el in body.select(".school-switch, .tenant-switch"):
        el.decompose()
    for el in body.select(".topbar-left"):
        el.unwrap()
    out = []
    for c in body.children:
        canon(c, out)
    # merge adjacent text tokens (React splits text around expressions)
    merged = []
    for t in out:
        if t[0] == "T" and merged and merged[-1][0] == "T":
            merged[-1] = ("T", merged[-1][1] + " " + t[1])
        else:
            merged.append(t)
    return [("T", re.sub(r"\s+", " ", t[1])) if t[0] == "T" else t for t in merged]


def main():
    bad = 0
    wired = [s for s in B.SCREENS if s["id"] in B.KEEP]
    for s in B.SCREENS:
        if s["id"] in B.KEEP:
            continue  # wired to the API by hand; compared by people, not this script
        route = B.ROUTE[s["id"]]
        built = NEXT / ("index.html" if route == "/" else route.strip("/") + ".html")
        mock = B.MOCK / "screens" / B.G.filename(s)
        a = tokens(mock.read_text(encoding="utf-8"), False)
        b = tokens(built.read_text(encoding="utf-8"), False)
        if a != b:
            bad += 1
            i = next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), min(len(a), len(b)))
            print(f"{s['id']} differs at token {i}/{len(a)}:\n   mock: {a[i] if i < len(a) else 'END'}\n    app: {b[i] if i < len(b) else 'END'}")
    checked = len(B.SCREENS) - len(wired)
    print(f"{checked - bad} of {checked} generated screens match their mock ({len(wired)} wired by hand, not compared).")


if __name__ == "__main__":
    main()
