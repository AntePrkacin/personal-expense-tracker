"""Render Jira issues and archived PRs into GitHub issue payloads.

Attribution rule: the repo owner renders as their GitHub handle (@izkreny, a
self-mention, so no notification); everyone else renders as a plain name or a
bare handle with no leading @, so nobody is pinged 170 times and no email
address enters a public tracker.
"""
import json
import re
from datetime import datetime, timezone

import config as C

JIRA_BASE = "https://decode.atlassian.net"
SRC_REPO = "AntePrkacin/personal-expense-tracker"

ME_JIRA = "Iskren Nemet"
ME_GH = "izkreny"

# Ante renders as a link to his GitHub profile everywhere he is named. A
# markdown link is deliberate rather than an @mention: the mention parser does
# not fire inside link text, so the handle shows and links without notifying
# him once per issue across 170 of them.
ANTE_GH = "AntePrkacin"
ANTE_URL = f"https://github.com/{ANTE_GH}"
ANTE_JIRA = "Ante Prkacin"


def who_jira(name):
    if name == ME_JIRA:
        return "@izkreny"
    if name == ANTE_JIRA:
        return f"[{ANTE_JIRA}]({ANTE_URL})"
    return name or "Unknown"


def who_gh(login):
    if login == ME_GH:
        return "@izkreny"
    if login == ANTE_GH:
        return f"[{ANTE_GH}]({ANTE_URL})"
    return login or "unknown"


# A verbatim copy would turn every historical @mention into a live ping at the
# new repo. GitHub does not resolve mentions inside a code span, so backticking
# keeps the text character-for-character while making it inert. The owner's own
# handle is left alone: a self-mention notifies nobody.
# `[` is in the lookbehind so a mention already inside markdown link text is
# left alone: it is a link, not a mention, and so notifies nobody already.
_MENTION = re.compile(r"(?<![\w`/@\[])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\b")
_SPLIT = re.compile(r"(```.*?```|``.*?``|`[^`\n]*`)", re.S)


# Direct links into Jira are removed: the ticket key stays as the historical
# record, but the URL goes, since it needs a Decode login to resolve. Figma links
# are untouched.
_JIRA_HOST = r"[a-z0-9.-]*atlassian\.net"
_JIRA_MDLINK = re.compile(r"\[([^\]\n]*)\]\(\s*https?://" + _JIRA_HOST + r"[^)\s]*\s*\)")
_JIRA_BARE = re.compile(r"(?::\s*)?<?https?://" + _JIRA_HOST + r"[^\s)\]`>]*>?")

_ANTE_AT = re.compile(r"(?<![`\w/@\[])@" + ANTE_GH + r"\b")
_ANTE_NAME = re.compile("(?<![`\\w\\[])Ante Prka[c\u010d]in\\b")


def _outside_code(text, fn):
    """Apply fn only outside code spans and fenced blocks."""
    return "".join(
        part if i % 2 else fn(part)
        for i, part in enumerate(_SPLIT.split(text))
    )


def strip_jira_links(text):
    if not text:
        return text

    def go(part):
        part = _JIRA_MDLINK.sub(lambda m: m.group(1), part)
        return _JIRA_BARE.sub("", part)

    return _outside_code(text, go)


def link_ante(text):
    if not text:
        return text

    def go(part):
        part = _ANTE_AT.sub(f"[@{ANTE_GH}]({ANTE_URL})", part)
        return _ANTE_NAME.sub(f"[{ANTE_JIRA}]({ANTE_URL})", part)

    return _outside_code(text, go)


def defuse_mentions(text):
    if not text:
        return text

    def sub(m):
        if m.group(1).lower() == ME_GH:
            return m.group(0)
        return f"`@{m.group(1)}`"

    return _outside_code(text, lambda p: _MENTION.sub(sub, p))


# Inherited `#NN` references were all written in the SOURCE repo's numbering. Left
# bare, GitHub would resolve each against the target repo, where #1-85 are Jira
# tickets and the rest are archived PRs - so every one would point at the wrong
# thing. Qualifying them with the source repo makes them resolve to the original
# PR instead. Measured on this corpus: 235 links across 62 distinct numbers, of
# which #7 and #69 do not exist upstream and will 404 rather than mislead.
#
# This runs on inherited text only. The epic child-checklists are appended after
# rewrite() and deliberately use the TARGET repo's numbers, so they stay bare.
_XREF = re.compile(r"(?<![\w`&/#\[])#(\d{1,4})\b")


def link_cross_refs(text):
    """Render as a markdown link so the visible text stays exactly `#NN`.

    The bare `AntePrkacin/personal-expense-tracker#NN` form is correct but reads
    terribly inline ("post-AntePrkacin/personal-expense-tracker#84"), and repeats
    a 39-character prefix 235 times. `/issues/NN` is used rather than `/pull/NN`
    because GitHub redirects it to the PR when the number is one, so the same URL
    is right for both.
    """
    if not text or not C.LINK_CROSS_REFS:
        # See config.LINK_CROSS_REFS: in the repository that owns these pull
        # requests, a bare `#NN` already resolves to the right thing.
        return text

    def go(part):
        return _XREF.sub(
            lambda m: f"[#{m.group(1)}](https://github.com/{SRC_REPO}/issues/{m.group(1)})",
            part,
        )

    return _outside_code(text, go)


# Jira wiki markup that survived as literal ADF *text* rather than becoming a
# node. `esc()` escapes the brackets, which then hides the `#NN` behind a `[` and
# defeats link_cross_refs' guard - so a bare `#34` shipped and GitHub autolinked
# it against the TARGET repo. Unwrapping first turns it into an ordinary markdown
# link, which the later transforms then handle correctly.
_WIKI_LINK = re.compile(r"\\\[([^|\]\n]{1,200})\|\s*(https?://[^\]\s|]+?)\s*\\\]")

# `[~accountid:...]` is the same class of leftover: an internal Atlassian
# identifier where a person's name belongs. Publishing it in a public tracker
# says nothing to a reader and exposes an account id, so it becomes the name.
_WIKI_ACCOUNT = re.compile(r"\\\[~accountid:([0-9a-f:\-]+)\\\]")
ACCOUNT_DISPLAY = {
    "712020:de2513ed-95de-49ca-8ae2-058fdce5902c": "@izkreny",
    "712020:2009d124-236b-4097-8a40-7cfa0d210be9": f"[{ANTE_JIRA}]({ANTE_URL})",
}


def unwiki(text):
    if not text:
        return text

    def go(part):
        part = _WIKI_LINK.sub(lambda m: f"[{m.group(1)}]({m.group(2)})", part)
        return _WIKI_ACCOUNT.sub(
            lambda m: ACCOUNT_DISPLAY.get(m.group(1), "someone"), part)

    return _outside_code(text, go)


def rewrite(text):
    """The single text pipeline every migrated body and comment goes through.

    Order matters: unwiki first, so a Jira-hosted wiki link becomes a markdown
    link that strip_jira_links can then remove like any other.
    """
    return defuse_mentions(
        link_ante(link_cross_refs(strip_jira_links(unwiki(text)))))


def dt(s, with_time=False):
    """Normalise to UTC and label it.

    Jira stamps arrive as +0200 and GitHub's as Z. Truncating the string dropped
    the offset, which silently put a 2-hour skew between the two halves of the
    archive. Everything is converted to UTC and marked, so the two are directly
    comparable and no reader has to guess a zone.
    """
    if not s:
        return None
    try:
        iso = s.replace("Z", "+00:00")
        if len(iso) > 5 and iso[-5] in "+-" and ":" not in iso[-5:]:
            iso = iso[:-5] + iso[-5:-2] + ":" + iso[-2:]
        d = datetime.fromisoformat(iso)
    except ValueError:
        return s
    if d.tzinfo is not None:
        d = d.astimezone(timezone.utc)
    return d.strftime("%Y-%m-%d %H:%M UTC" if with_time else "%Y-%m-%d")


# ---------------------------------------------------------------- Jira

STATE_FOR = {"Done": ("closed", "completed"), "To Do": ("open", None),
             "In Progress": ("open", None)}


# GitHub label names are unique case-insensitively, so Jira's `Backend` and
# `backend` cannot both exist. Fold to the casing Jira used most often.
LABEL_CANON = {}


def build_label_canon(all_jira_fields):
    counts = {}
    for fl in all_jira_fields:
        for l in fl.get("labels") or []:
            counts.setdefault(l.lower(), {}).setdefault(l, 0)
            counts[l.lower()][l] += 1
    LABEL_CANON.clear()
    for low, variants in counts.items():
        winner = max(variants.items(), key=lambda t: (t[1], t[0]))[0]
        for v in variants:
            LABEL_CANON[v] = winner
    return {k: v for k, v in LABEL_CANON.items() if k != v}


def jira_labels(fl):
    out = {"jira"}
    out.add("type:" + fl["issuetype"]["name"].lower())
    st = fl["status"]["name"]
    if st == "In Progress":
        out.add("status:in-progress")
    for l in fl.get("labels") or []:
        out.add(LABEL_CANON.get(l, l))
    p = fl.get("priority")
    if p:
        out.add("priority:" + p["name"].lower())
    # Sprint has no GitHub equivalent; a label keeps it filterable, which is what
    # it was for. "PET Sprint 2" -> "sprint-2".
    for sp in fl.get("customfield_10115") or []:
        name = sp.get("name") if isinstance(sp, dict) else str(sp)
        if name:
            out.add("sprint-" + name.rsplit(" ", 1)[-1])
    return sorted(out)


def jira_link_keys(fl):
    """Jira `Blocks` relations, split by direction.

    An entry carrying `outwardIssue` means this issue blocks that one; one
    carrying `inwardIssue` means this issue is blocked by it. 19 relations exist,
    each stored on both endpoints, so rendering both directions is symmetric.
    """
    blocks, blocked_by = [], []
    for l in fl.get("issuelinks") or []:
        if (l.get("type") or {}).get("name") != "Blocks":
            continue
        if l.get("outwardIssue"):
            blocks.append(l["outwardIssue"]["key"])
        elif l.get("inwardIssue"):
            blocked_by.append(l["inwardIssue"]["key"])
    keyn = lambda k: int(k.split("-")[1])  # noqa: E731
    return sorted(set(blocks), key=keyn), sorted(set(blocked_by), key=keyn)


def jira_body(d, adf_to_md, key_to_num=None):
    fl = d["fields"]
    key = d["key"]
    meta = []
    meta.append(f"**Migrated from Jira** · `{key}`")
    bits = [f"**Type** {fl['issuetype']['name']}",
            f"**Status** {fl['status']['name']}"]
    if fl.get("priority"):
        bits.append(f"**Priority** {fl['priority']['name']}")
    sp = fl.get("customfield_10432")
    if sp:
        bits.append(f"**Points** {sp:g}")
    meta.append(" · ".join(bits))

    rep = fl.get("reporter")
    asg = fl.get("assignee")
    meta.append(
        f"**Reporter** {who_jira(rep['displayName']) if rep else '—'}"
        f" · **Assignee** {who_jira(asg['displayName']) if asg else '_unassigned_'}"
    )
    times = [f"**Created** {dt(fl.get('created'))}"]
    if fl.get("resolutiondate"):
        times.append(f"**Resolved** {dt(fl.get('resolutiondate'))}")
    meta.append(" · ".join(times))

    blocks, blocked_by = jira_link_keys(fl)
    if blocks or blocked_by:
        def refs(keys):
            return ", ".join(
                f"#{key_to_num[k]}" if key_to_num and k in key_to_num else f"`{k}`"
                for k in keys)
        parts = []
        if blocks:
            parts.append(f"**Blocks** {refs(blocks)}")
        if blocked_by:
            parts.append(f"**Blocked by** {refs(blocked_by)}")
        meta.append(" · ".join(parts))

    par = fl.get("parent")
    if par:
        pk = par["key"]
        ref = f"#{key_to_num[pk]}" if key_to_num and pk in key_to_num else pk
        meta.append(f"**Epic** {ref} · {par['fields']['summary']}")

    head = "\n".join("> " + m for m in meta)
    desc = rewrite(adf_to_md(fl.get("description"))) or "_No description in Jira._"
    return head + "\n\n---\n\n" + desc


def jira_comments(d, adf_to_md):
    out = []
    for c in d["fields"].get("comment", {}).get("comments", []):
        a = (c.get("author") or {}).get("displayName")
        stamp = dt(c.get("created"), True)
        edited = ""
        if c.get("updated") and c["updated"][:19] != c["created"][:19]:
            edited = f" · edited {dt(c['updated'], True)}"
        head = f"> **{who_jira(a)}** commented on Jira · {stamp}{edited}"
        out.append(head + "\n\n---\n\n"
                   + (rewrite(adf_to_md(c.get("body"))) or "_empty_"))
    return out


# ---------------------------------------------------------------- PRs

BOT_RE = re.compile(r"\[bot\]$")


def is_bot(user):
    return user.get("type") == "Bot" or bool(BOT_RE.search(user.get("login", "")))


def pr_labels(p):
    out = {"pr-archive"}
    out.add("merged" if p.get("merged_at") else "not-merged")
    return sorted(out)


def pr_body(p, extra):
    meta = []
    meta.append(
        f"**Archived pull request** · "
        f"[{SRC_REPO}#{p['number']}](https://github.com/{SRC_REPO}/pull/{p['number']})"
    )
    state = "Merged" if p.get("merged_at") else "Closed without merging"
    meta.append(f"**State** {state} · **Author** {who_gh(p['user']['login'])}")
    asg = [who_gh(a["login"]) for a in (p.get("assignees") or [])]
    rev = [who_gh(r["login"]) for r in (p.get("requested_reviewers") or [])]
    meta.append(
        f"**Assignee** {', '.join(asg) if asg else '_unassigned_'}"
        + (f" · **Reviewers** {', '.join(rev)}" if rev else "")
    )
    meta.append(
        f"**Branch** `{p['head']['ref']}` → `{p['base']['ref']}`"
    )
    times = [f"**Opened** {dt(p.get('created_at'))}"]
    if p.get("merged_at"):
        times.append(f"**Merged** {dt(p.get('merged_at'))}")
    elif p.get("closed_at"):
        times.append(f"**Closed** {dt(p.get('closed_at'))}")
    if extra:
        times.append(
            f"**{extra.get('commits', 0)} commits** · "
            f"{extra.get('changed_files', 0)} file"
            f"{'' if extra.get('changed_files') == 1 else 's'} · "
            f"+{extra.get('additions', 0)}/-{extra.get('deletions', 0)}"
        )
    meta.append(" · ".join(times))
    # GitHub populates merge_commit_sha with a throwaway test-merge SHA even on
    # PRs that were closed unmerged, so printing it unconditionally invented a
    # merge commit for four PRs that never had one.
    if p.get("merged_at") and p.get("merge_commit_sha"):
        line = f"**Merge commit** `{p['merge_commit_sha'][:10]}`"
        if (p.get("merged_by") or {}).get("login"):
            line += f" · **Merged by** {who_gh(p['merged_by']['login'])}"
        meta.append(line)

    head = "\n".join("> " + m for m in meta)
    body = rewrite((p.get("body") or "").strip()) \
        or "_No description on the pull request._"
    return head + "\n\n---\n\n" + body


def pr_comments(p, comments, reviews, review_comments):
    """Chronological, Vercel and every other bot stripped."""
    items = []
    for c in comments:
        if is_bot(c["user"]):
            continue
        items.append((c["created_at"],
                      f"> **{who_gh(c['user']['login'])}** commented · "
                      f"{dt(c['created_at'], True)}\n\n---\n\n"
                      f"{rewrite((c.get('body') or '').strip())}"))
    for r in reviews:
        if is_bot(r["user"]):
            continue
        body = (r.get("body") or "").strip()
        if not body:
            continue
        verdict = {"APPROVED": "approved", "CHANGES_REQUESTED": "requested changes",
                   "COMMENTED": "reviewed"}.get(r.get("state"), (r.get("state") or "").lower())
        items.append((r.get("submitted_at") or "",
                      f"> **{who_gh(r['user']['login'])}** {verdict} · "
                      f"{dt(r.get('submitted_at'), True)}\n\n---\n\n"
                      f"{rewrite(body)}"))
    for c in review_comments:
        if is_bot(c["user"]):
            continue
        loc = c.get("path", "")
        line = c.get("line") or c.get("original_line")
        where = f"`{loc}`" + (f" line {line}" if line else "")
        hunk = (c.get("diff_hunk") or "").strip()
        snippet = ""
        if hunk:
            tail = hunk.split("\n")[-6:]
            snippet = "\n```diff\n" + "\n".join(tail) + "\n```\n"
        items.append((c["created_at"],
                      f"> **{who_gh(c['user']['login'])}** reviewed {where} · "
                      f"{dt(c['created_at'], True)}\n"
                      f"{snippet}\n---\n\n"
                      f"{rewrite((c.get('body') or '').strip())}"))
    items.sort(key=lambda t: t[0] or "")
    return [b for _, b in items]
