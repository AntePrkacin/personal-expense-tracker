"""Build the migration payloads.

The one rule that shapes this file: **no target-repo issue number is ever
predicted**. `build(num_map=None)` produces the bodies used at *create* time,
which reference nothing in the target repo. After creation, the real numbers
come back from the API and `build(num_map=real)` re-renders the 76 bodies that
need them, which the apply step PATCHes.

The dry run calls it with a predicted map purely so a human can read what the
finished issue will look like. Nothing is written from that map.
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adf2md import adf_to_md  # noqa: E402
import render as R  # noqa: E402
import config as C  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

# Jira display name -> GitHub login. Only collaborators on the target repo can be
# assigned; anyone else stays unassigned rather than being dropped by the API.
GH_LOGIN = {"Iskren Nemet": "izkreny", "Ante Prkacin": "AntePrkacin"}


def keynum(k):
    return int(k.split("-")[1])


def load_list(p):
    try:
        d = json.load(open(p))
        return d if isinstance(d, list) else []
    except Exception:
        return []


def jira_assignees(fl):
    """Assignee, else the reporter - except epics, which nobody owns (all 8 are
    unassigned in Jira, and that is deliberate rather than an omission)."""
    name = (fl.get("assignee") or {}).get("displayName")
    if name in GH_LOGIN:
        return [GH_LOGIN[name]]
    if fl["issuetype"]["name"] == "Epic":
        return []
    rep = (fl.get("reporter") or {}).get("displayName")
    return [GH_LOGIN[rep]] if rep in GH_LOGIN else []


def pr_assignees(p):
    """PR assignees, else the author, which is always recorded."""
    got = [a["login"] for a in (p.get("assignees") or [])
           if a["login"] in GH_LOGIN.values()]
    if got:
        return got
    author = p["user"]["login"]
    return [author] if author in GH_LOGIN.values() else []


def load_sources():
    os.chdir(HERE)
    jira = {}
    for f in glob.glob("jira/issues/PET-*.json"):
        d = json.load(open(f))
        jira[d["key"]] = d
    prs = {p["number"]: p for p in json.load(open("gh/prs.json"))}
    return jira, prs


def creation_order(jira, prs):
    """Epics first, so that when the patch pass runs every child already has a
    real number for its epic. Then remaining Jira keys, then PRs."""
    epics = sorted([k for k, d in jira.items()
                    if d["fields"]["issuetype"]["name"] == "Epic"], key=keynum)
    rest = sorted([k for k in jira if k not in epics], key=keynum)
    return epics + rest, sorted(prs)


def build(num_map=None):
    """num_map: {'PET-6': 6, 'PR-18': 101} of REAL issue numbers, or None.

    With None, bodies carry no target-repo references at all - safe to create
    before any number is known.
    """
    jira, prs = load_sources()
    R.build_label_canon([d["fields"] for d in jira.values()])
    jira_order, pr_order = creation_order(jira, prs)

    items = []
    for k in jira_order:
        d = jira[k]
        fl = d["fields"]
        state, reason = R.STATE_FOR[fl["status"]["name"]]
        body = R.jira_body(d, adf_to_md, num_map)
        children = sorted(
            [c for c in jira
             if (jira[c]["fields"].get("parent") or {}).get("key") == k],
            key=keynum,
        )
        if children and num_map:
            # Two blank lines before the rule: with one, `---` is read as a
            # setext underline and turns the preceding paragraph into an <h2>,
            # which is what it did on all 8 epics until this was caught.
            lines = ["", "", "---", "", f"## Child tasks ({len(children)})", ""]
            for c in children:
                done = jira[c]["fields"]["status"]["name"] == "Done"
                ref = f"#{num_map[c]}" if c in num_map else f"`{c}`"
                lines.append(
                    f"- [{'x' if done else ' '}] {ref} `{c}` "
                    f"{jira[c]['fields']['summary']}"
                )
            body += "\n".join(lines)
        items.append({
            "kind": "jira",
            "src": k,
            "title": f"[{k}] {fl['summary']}",
            "labels": R.jira_labels(fl),
            "state": state,
            "state_reason": reason,
            "body": body,
            "comments": R.jira_comments(d, adf_to_md),
            "assignees": jira_assignees(fl),
            "children": children,
            "parent": (fl.get("parent") or {}).get("key"),
            # True when this body changes once real numbers are known.
            # Anything whose body carries a target-repo number: an epic's
            # checklist, a child's epic line, or a Blocks relation.
            "needs_patch": bool(children) or bool(fl.get("parent"))
            or any(R.jira_link_keys(fl)),
        })

    for n in (pr_order if C.INCLUDE_PR_ARCHIVE else []):
        p = prs[n]
        extra = json.load(open(f"gh/pr-{n}-full.json"))
        items.append({
            "kind": "pr",
            "src": f"PR-{n}",
            "title": f"[PR-{n}] {p['title']}",
            "labels": R.pr_labels(p),
            "state": "closed",
            "state_reason": "completed" if p.get("merged_at") else "not_planned",
            "body": R.pr_body(p, extra),
            "comments": R.pr_comments(p, load_list(f"gh/comments/{n}.json"),
                                      load_list(f"gh/reviews/{n}.json"),
                                      load_list(f"gh/reviewcomments/{n}.json")),
            "assignees": pr_assignees(p),
            "children": [],
            "parent": None,
            "needs_patch": False,
        })
    return items


def all_labels(items):
    out = {}
    for it in items:
        for l in it["labels"]:
            out[l] = out.get(l, 0) + 1
    return out
