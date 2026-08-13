#!/usr/bin/env python3
"""Run the migration against GitHub. Resumable, and never predicts a number.

Phases:
  0  preflight    - target tracker EMPTY on a first run; reconcile on a resume;
                    issues enabled; ADF fully converted; assignees valid
  1  labels       - create the labels with colours
  2  create       - the issues, bodies carrying NO target-repo numbers; record the
                    real number and node_id GitHub returns
  3  comments     - the comments, resumed by reading back what already exists
  4  patch+close  - re-render the number-bearing bodies from the real map and
                    set final state in the same PATCH
  5  subissues    - 68 native parent/child links (verified to work on closed
                    issues, so the phase order is deliberate)
  6  verify       - assert the finished state matches the plan

Assignees are set at CREATE time when --assign is passed; there is no separate
assignment phase, because doing both double-posted every assignment. assign.py
exists for the case where the issues already exist.

Which scenario this runs - which repo, whether pull requests are archived, whether
`#NN` is rewritten - is entirely in config.py. Read that first.

  python3 apply.py                 # print the plan, write nothing
  python3 apply.py --run           # phases 0-6
  python3 apply.py --run --assign  # ... and set assignees (notifies Ante on 62)
"""
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import adf2md  # noqa: E402
import build as B  # noqa: E402
import config as C  # noqa: E402

REPO = C.REPO
API = "https://api.github.com"

# Keep the state file out of the scratchpad if asked: losing it mid-run means
# resume is impossible and every issue created so far must be deleted by hand.
STATE_PATH = os.environ.get("MIGRATION_STATE", os.path.join(HERE, "apply-state.json"))
LOCK_PATH = STATE_PATH + ".lock"

# GitHub allows ~80 content-generating requests per MINUTE and ~500 per HOUR.
# The hourly cap is what binds a 591-mutation run, and community reports show
# blocks well below it, with no Retry-After. 7.2s spreads the whole run over
# ~71 minutes and keeps content creation near 300/hour.
PACE_S = 7.2
HTTP_TIMEOUT_S = 30

LABEL_COLOURS = {
    "jira": "5319e7", "pr-archive": "1d76db", "merged": "6f42c1",
    "not-merged": "b60205", "type:epic": "3e4b9e", "type:task": "0e8a16",
    "type:story": "0e8a16", "type:bug": "d73a4a", "status:in-progress": "fbca04",
    "priority:critical": "b60205", "priority:high": "d93f0b",
    "priority:medium": "fbca04", "priority:low": "c2e0c6",
    "sprint-1": "bfd4f2", "sprint-2": "bfd4f2",
}
DEFAULT_COLOUR = "ededed"
TITLE_RE = re.compile(r"^\[(PET-\d+|PR-\d+)\]")

TOKEN = None


def token():
    return subprocess.run(["gh", "auth", "token"], capture_output=True, text=True,
                          check=True, timeout=15).stdout.strip()


def req(method, path, body=None, graphql=False, tolerate=(), _tries=0):
    """One API call.

    A POST is NEVER retried on 5xx: GitHub can return 502 after the write has
    already committed, so a blind retry creates a duplicate that state knows
    nothing about. 403/429 mean the request was rejected rather than performed,
    so those are safe to retry for any method.
    """
    url = "https://api.github.com/graphql" if graphql else f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {TOKEN}")
    r.add_header("Accept", "application/vnd.github+json")
    r.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        r.add_header("Content-Type", "application/json")

    def backoff(wait, why):
        print(f"    ! {why}; waiting {wait}s (attempt {_tries + 1}/8)", flush=True)
        time.sleep(wait)
        return req(method, path, body, graphql, tolerate, _tries + 1)

    try:
        with urllib.request.urlopen(r, timeout=HTTP_TIMEOUT_S) as resp:
            raw = resp.read()
            out = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        low = raw.lower()
        is_limit = (e.code == 429 or "rate limit" in low or "abuse" in low
                    or e.headers.get("x-ratelimit-remaining") == "0")
        if e.code == 403 and not is_limit:
            raise SystemExit(
                f"403 that is NOT a rate limit on {method} {path} - check token "
                f"scopes and repo permissions.\n{raw[:600]}")
        # 4xx is a permanent answer - a wrong repo name or a bad payload - so
        # retrying it just delays the error. Without the 5xx condition a typo in
        # config.REPO backed off for 36 minutes before reporting a 404.
        safe = is_limit or (e.code >= 500 and method in ("GET", "PATCH", "PUT"))
        if safe and _tries < 8:
            ra = (e.headers.get("Retry-After") or "").strip()
            reset = e.headers.get("x-ratelimit-reset")
            if ra.isdigit():
                wait = int(ra)
            elif is_limit and reset and reset.isdigit():
                wait = max(1, int(reset) - int(time.time()) + 2)
            else:
                wait = min(600, 15 * 2 ** _tries)
            return backoff(wait, f"HTTP {e.code}")
        raise SystemExit(
            f"HTTP {e.code} on {method} {path}"
            + ("  (POST not retried on 5xx - it may have succeeded; rerun and "
               "phase 0 will reconcile)" if method == "POST" else "")
            + f"\n{raw[:600]}")
    except (urllib.error.URLError, socket.timeout, TimeoutError) as e:
        if _tries < 8 and method != "POST":
            return backoff(min(600, 15 * 2 ** _tries), f"network error {e}")
        raise SystemExit(
            f"network error on {method} {path}: {e}"
            + ("  (POST not retried; rerun and phase 0 will reconcile)"
               if method == "POST" else ""))
    if graphql and out.get("errors"):
        blob = json.dumps(out["errors"]).lower()
        if any(t in blob for t in tolerate):
            return {"tolerated": True}
        raise SystemExit(f"GraphQL error on {path}: {json.dumps(out['errors'])[:600]}")
    return out


def load_state():
    if os.path.exists(STATE_PATH):
        s = json.load(open(STATE_PATH))
        if s.get("repo") not in (None, REPO):
            raise SystemExit(f"state file is for {s['repo']}, not {REPO}")
        return s
    return {"repo": REPO, "created": {}, "commented": {}, "patched": [],
            "subissued": [], "labels_done": False}


def save_state(s):
    s["repo"] = REPO
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(s, fh, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, STATE_PATH)


def paged(path):
    out, page = [], 1
    while True:
        sep = "&" if "?" in path else "?"
        got = req("GET", f"{path}{sep}per_page=100&page={page}")
        if not got:
            break
        out.extend(got)
        if len(got) < 100:
            break
        page += 1
    return out


# --------------------------------------------------------------- phases

def phase0(items, state, want_assign):
    print("PHASE 0  preflight")
    # An unhandled node or mark type means content was reshaped without anyone
    # deciding how, so it is fatal. A "table:" note records a fix that was
    # applied, not a gap, so it only warns.
    gaps = {u for u in adf2md.UNKNOWN if not u.startswith("table:")}
    notes = sorted(adf2md.UNKNOWN - gaps)
    if gaps:
        raise SystemExit(f"unhandled ADF types: {sorted(gaps)}")
    print("    ADF conversion: no unknown node or mark types"
          + (f"  (notes: {notes})" if notes else ""))
    got = req("GET", f"/repos/{REPO}")
    if not got.get("has_issues"):
        raise SystemExit("issues are disabled on the target repo")
    print(f"    repo {got['full_name']}  default={got['default_branch']}"
          f"  issues enabled")

    # The REST issues endpoint counts pull requests as issues, so a repo that
    # already owns 85 PRs is not "non-empty" in any sense that matters here. What
    # would actually be dangerous is a PREVIOUS migration's issues, which is what
    # this looks for: a [PET-n] or [PR-n] title with no state file to explain it.
    everything = paged(f"/repos/{REPO}/issues?state=all")
    existing = [i for i in everything if "pull_request" not in i]
    prs_present = len(everything) - len(existing)
    already_migrated = [i for i in existing if TITLE_RE.match(i["title"])]
    print(f"    tracker: {len(existing)} issue(s), {prs_present} pull request(s)")
    if not state["created"] and already_migrated:
        raise SystemExit(
            f"ABORT: {len(already_migrated)} issue(s) already look migrated "
            f"(e.g. #{already_migrated[0]['number']} "
            f"{already_migrated[0]['title'][:48]!r}) but this state file is empty. "
            "A previous run may have been interrupted with its state lost. "
            "Inspect before proceeding.")
    # A crash between a POST and the state write leaves an untracked issue.
    # Adopt anything already present, matched on its [PET-n]/[PR-n] title, so a
    # resume never re-creates it.
    adopted = 0
    for i in already_migrated:
        m = TITLE_RE.match(i["title"])
        if m and m.group(1) not in state["created"]:
            state["created"][m.group(1)] = {"number": i["number"],
                                            "node_id": i["node_id"]}
            adopted += 1
    if adopted:
        save_state(state)
        print(f"    adopted {adopted} issue(s) created but not recorded")
    if state["created"]:
        print(f"    resuming: {len(state['created'])}/{len(items)} created")
    if want_assign:
        for login in sorted({a for i in items for a in i["assignees"]}):
            req("GET", f"/repos/{REPO}/assignees/{login}")
            print(f"    assignee {login}: assignable")
    print()


def phase1_labels(items, state):
    print("PHASE 1  labels")
    if state["labels_done"]:
        print("    already done\n")
        return
    have = {l["name"] for l in paged(f"/repos/{REPO}/labels")}
    for name in sorted(B.all_labels(items)):
        if name in have:
            continue
        req("POST", f"/repos/{REPO}/labels",
            {"name": name, "color": LABEL_COLOURS.get(name, DEFAULT_COLOUR),
             "description": {"jira": "Migrated from Jira",
                             "pr-archive": "Archived pull request"}.get(name, "")})
        print(f"    created {name}")
        time.sleep(PACE_S)
    state["labels_done"] = True
    save_state(state)
    print()


def phase2_create(items, state, want_assign):
    todo = [i for i in items if i["src"] not in state["created"]]
    print(f"PHASE 2  create {len(todo)} of {len(items)} issues")
    for n, it in enumerate(todo, 1):
        payload = {"title": it["title"], "body": it["body"], "labels": it["labels"]}
        if want_assign and it["assignees"]:
            payload["assignees"] = it["assignees"]
        got = req("POST", f"/repos/{REPO}/issues", payload)
        state["created"][it["src"]] = {"number": got["number"],
                                       "node_id": got["node_id"]}
        save_state(state)
        print(f"    [{n:>3}/{len(todo)}] {it['src']:<7} -> #{got['number']}", flush=True)
        time.sleep(PACE_S)
    print()


def phase3_comments(items, state, resuming):
    total = sum(len(i["comments"]) for i in items)
    print(f"PHASE 3  {total} comments")
    done = 0
    for it in items:
        if not it["comments"]:
            continue
        num = state["created"][it["src"]]["number"]
        already = state["commented"].get(it["src"], 0)
        if resuming and already < len(it["comments"]):
            # Read back rather than trusting the counter: a crash between the
            # POST and the save would otherwise repost one comment. Comments are
            # posted in order, so N existing means the first N are done.
            live = len(paged(f"/repos/{REPO}/issues/{num}/comments"))
            if live != already:
                already = max(already, live)
                state["commented"][it["src"]] = already
                save_state(state)
        for idx, body in enumerate(it["comments"]):
            done += 1
            if idx < already:
                continue
            req("POST", f"/repos/{REPO}/issues/{num}/comments", {"body": body})
            state["commented"][it["src"]] = idx + 1
            save_state(state)
            print(f"    [{done:>3}/{total}] #{num} comment {idx + 1}"
                  f"/{len(it['comments'])}", flush=True)
            time.sleep(PACE_S)
    print()


def phase4_patch_and_close(state):
    num_map = {src: v["number"] for src, v in state["created"].items()}
    final = B.build(num_map)
    todo = [i for i in final if i["src"] not in state["patched"]]
    print(f"PHASE 4  patch bodies + final state ({len(todo)} of {len(final)})")
    for n, it in enumerate(todo, 1):
        num = num_map[it["src"]]
        payload = {}
        if it["needs_patch"]:
            payload["body"] = it["body"]
        if it["state"] == "closed":
            payload["state"] = "closed"
            payload["state_reason"] = it["state_reason"]
        if payload:
            req("PATCH", f"/repos/{REPO}/issues/{num}", payload)
            bits = ("body+" if "body" in payload else "") + payload.get("state", "")
            print(f"    [{n:>3}/{len(todo)}] #{num} {it['src']:<7} {bits}", flush=True)
            time.sleep(PACE_S)
        state["patched"].append(it["src"])
        save_state(state)
    print()


def phase5_subissues(state):
    num_map = {src: v["number"] for src, v in state["created"].items()}
    final = B.build(num_map)
    pairs = [(i["src"], c) for i in final for c in i["children"]]
    todo = [p for p in pairs if f"{p[0]}>{p[1]}" not in state["subissued"]]
    print(f"PHASE 5  {len(todo)} of {len(pairs)} sub-issue links")
    for n, (parent, child) in enumerate(todo, 1):
        req("POST", "/graphql", {
            "query": "mutation($p:ID!,$c:ID!){addSubIssue(input:{issueId:$p,"
                     "subIssueId:$c}){issue{number}}}",
            "variables": {"p": state["created"][parent]["node_id"],
                          "c": state["created"][child]["node_id"]},
        }, graphql=True, tolerate=("duplicate", "already"))
        state["subissued"].append(f"{parent}>{child}")
        save_state(state)
        print(f"    [{n:>3}/{len(todo)}] #{num_map[parent]} <- #{num_map[child]}"
              f"  ({parent} <- {child})", flush=True)
        time.sleep(PACE_S)
    print()


def phase6_verify(items, state):
    print("PHASE 6  verify")
    num_map = {src: v["number"] for src, v in state["created"].items()}
    final = B.build(num_map)
    live = {i["number"]: i for i in paged(f"/repos/{REPO}/issues?state=all")}
    problems = []
    want = {i["src"] for i in items}
    missing = want - set(state["created"])
    extra = set(state["created"]) - want
    if missing:
        problems.append(f"{len(missing)} never created, e.g. {sorted(missing)[:5]}")
    if extra:
        problems.append(f"{len(extra)} in state but not in the plan: {sorted(extra)[:5]}")
    for it in final:
        num = num_map.get(it["src"])
        got = live.get(num)
        if not got:
            problems.append(f"{it['src']} (#{num}) not found")
            continue
        if got["state"] != it["state"]:
            problems.append(f"#{num} state {got['state']} != {it['state']}")
        if got["comments"] != len(it["comments"]):
            problems.append(f"#{num} has {got['comments']} comments,"
                            f" expected {len(it['comments'])}")
        if {l["name"] for l in got["labels"]} != set(it["labels"]):
            problems.append(f"#{num} labels differ")
    print(f"    issues live      : {len(live)}")
    print(f"    comments expected: {sum(len(i['comments']) for i in final)}")
    print(f"    sub-issue links  : {len(state['subissued'])}"
          f"/{sum(len(i['children']) for i in final)}")
    if problems:
        print("    PROBLEMS:")
        for p in problems[:25]:
            print(f"      - {p}")
        raise SystemExit(f"{len(problems)} verification problem(s)")
    print("    all checks passed\n")


def main():
    global TOKEN
    args = set(sys.argv[1:])
    want_assign = "--assign" in args
    items = B.build(None)

    if "--run" not in args:
        labels = B.all_labels(items)
        subs = sum(len(i["children"]) for i in items)
        comments = sum(len(i["comments"]) for i in items)
        patches = sum(1 for i in items if i["needs_patch"] or i["state"] == "closed")
        muts = len(labels) + len(items) + comments + patches + subs
        print("PLAN (nothing will be written)\n")
        print(f"  target repo      : {REPO}")
        print(f"  state file       : {STATE_PATH}")
        print(f"  issues           : {len(items)}")
        print(f"  comments         : {comments}")
        print(f"  labels           : {len(labels)}")
        print(f"  bodies to patch  : {sum(1 for i in items if i['needs_patch'])}")
        print(f"  issues to close  : {sum(1 for i in items if i['state']=='closed')}")
        print(f"  sub-issue links  : {subs}")
        print(f"  assignees        : {'ON, ' if want_assign else 'OFF (--assign), '}"
              f"{sum(1 for i in items if i['assignees'])} issues would carry one")
        print(f"\n  ~{muts} mutations at {PACE_S}s = ~{muts * PACE_S / 60:.0f} min")
        print("\n  run with:  python3 apply.py --run"
              + ("  --assign" if want_assign else ""))
        return

    try:
        fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise SystemExit(
            f"lock file exists: {LOCK_PATH}\n"
            "Another run may be in progress. If none is, the last run died; "
            "delete the lock and rerun - resume is safe.")
    try:
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        TOKEN = token()
        state = load_state()
        resuming = bool(state["created"])
        t0 = time.time()
        phase0(items, state, want_assign)
        phase1_labels(items, state)
        phase2_create(items, state, want_assign)
        phase3_comments(items, state, resuming)
        phase4_patch_and_close(state)
        phase5_subissues(state)
        phase6_verify(items, state)
        print(f"DONE in {(time.time() - t0) / 60:.1f} min. "
              f"https://github.com/{REPO}/issues")
    finally:
        try:
            os.unlink(LOCK_PATH)
        except OSError:
            pass


if __name__ == "__main__":
    main()
