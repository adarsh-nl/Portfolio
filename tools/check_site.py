#!/usr/bin/env python3
"""Consistency check for the hand-maintained pages of this site.

Every page is plain HTML with a copied <head>, header and footer, so small
omissions creep in (a post that forgot site.js, a stub page left in the
sitemap). This script catches those. Standard library only; run it from
the repository root before committing:

    python3 tools/check_site.py

Exit status is 1 if any check fails.
"""

import glob
import html
import os
import re
import sys
import xml.etree.ElementTree as ET

BASE = "https://adarsh-nl.github.io/Portfolio/"
PREFIX = "/Portfolio/"

problems = []


def fail(page, msg):
    problems.append(f"{page}: {msg}")


def url_for(path):
    d = os.path.dirname(path)
    return BASE + (d + "/" if d else "")


def strip_comments(s):
    return re.sub(r"<!--.*?-->", "", s, flags=re.S)


pages = sorted(p for p in glob.glob("**/*.html", recursive=True)
               if not os.path.basename(p).startswith("google"))

sitemap = {loc.text.strip() for loc in ET.parse("sitemap.xml").getroot().iter(
    "{http://www.sitemaps.org/schemas/sitemap/0.9}loc")}

titles = {}
inbound = {}

for p in pages:
    s = strip_comments(open(p, encoding="utf-8").read())
    is_404 = p == "404.html"
    noindex = bool(re.search(r'<meta name="robots" content="[^"]*noindex', s))

    if len(re.findall(r'<main\b[^>]*id="main"', s)) != 1:
        fail(p, "needs exactly one <main id=\"main\">")
    if not is_404 and len(re.findall(r"<h1\b", s)) != 1:
        fail(p, f"has {len(re.findall(r'<h1', s))} <h1> elements (want 1)")
    if "/Portfolio/assets/site.js" not in s:
        fail(p, "does not load site.js (theme toggle and mobile menu will not work)")
    if 'href="/Portfolio/assets/cms/cmunrm.woff2"' not in s:
        fail(p, "missing the body-font preload")
    for img in re.findall(r"<img\b[^>]*>", s):
        if "alt=" not in img:
            fail(p, f"image without alt: {img[:80]}")

    t = re.search(r"<title>(.*?)</title>", s, re.S)
    if not t:
        fail(p, "no <title>")
    else:
        titles.setdefault(html.unescape(t.group(1).strip()), []).append(p)

    if not is_404:
        canon = re.search(r'<link rel="canonical" href="([^"]+)"', s)
        if not canon or canon.group(1) != url_for(p):
            fail(p, f"canonical should be {url_for(p)}")
        if not re.search(r'<meta name="description" content="[^"]{50,}"', s):
            fail(p, "missing or very short meta description")
        if noindex and url_for(p) in sitemap:
            fail(p, "is noindex but listed in sitemap.xml")
        if not noindex and url_for(p) not in sitemap:
            fail(p, "is indexable but missing from sitemap.xml")

    # internal links must resolve to a file in the repo
    for href in re.findall(r'(?:href|src|data-src)="(/Portfolio/[^"#?]*)', s):
        rel = href[len(PREFIX):]
        target = os.path.join(rel, "index.html") if rel == "" or rel.endswith("/") else rel
        if not os.path.exists(target):
            fail(p, f"broken internal link {href}")
        if href.endswith("/") or href == PREFIX:
            inbound.setdefault(BASE + rel, set()).add(p)

for t, ps in titles.items():
    if len(ps) > 1:
        problems.append(f"duplicate <title> {t!r}: {', '.join(ps)}")

for loc in sorted(sitemap):
    path = loc[len(BASE):]
    f = os.path.join(path, "index.html") if path else "index.html"
    if not os.path.exists(f):
        problems.append(f"sitemap.xml lists {loc}, which has no file")
    linked_from = inbound.get(loc, set()) - {f}
    if loc != BASE and not linked_from:
        problems.append(f"sitemap.xml lists {loc}, but no other page links to it")

if problems:
    print("\n".join(problems))
    print(f"\n{len(problems)} problem(s) in {len(pages)} pages")
    sys.exit(1)
print(f"OK: {len(pages)} pages, {len(sitemap)} sitemap URLs, no problems")
