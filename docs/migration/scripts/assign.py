#!/usr/bin/env python3
"""Assign the already-created issues. Resumable.

Needed as a separate pass because apply.py sets assignees only at CREATE time:
the duplicate phase-6 assignment was removed after review, so with all 170
issues already created there is no code path left that assigns them.

Unlike issue creation, POST /issues/{n}/assignees is idempotent - adding an
assignee who is already assigned is a no-op - so a retry after a 5xx cannot
duplicate anything, and this pass reconciles against the live state anyway.

  python3 assign.py          # plan only, writes nothing
  python3 assign.py --run
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # noqa: E402
import apply as A  # noqa: E402

STATE = os.path.join(HERE, "assign-state.json")


def load():
    return json.load(open(STATE)) if os.path.exists(STATE) else {"done": []}


def save(s):
    tmp = STATE + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(s, fh, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, STATE)


def main():
    run = "--run" in sys.argv[1:]
    # apply.py guards this and assign.py did not, which mattered: the other
    # scenario's state file holds numbers 1-170, and 85 of those are live pull
    # requests in this repository. Copying that file here - the two working
    # directories have been swapping scripts all day - would have assigned people
    # onto someone else's real PRs.
    _st = json.load(open(os.path.join(HERE, "apply-state.json")))
    if _st.get("repo") not in (None, A.REPO):
        raise SystemExit(
            f"state file is for {_st['repo']}, not {A.REPO} - refusing to run")
    created = _st["created"]
    items = [i for i in B.build(None) if i["assignees"]]
    missing = [i["src"] for i in items if i["src"] not in created]
    if missing:
        raise SystemExit(f"not created yet, refusing to run: {missing[:5]}")

    per = {}
    for i in items:
        for a in i["assignees"]:
            per[a] = per.get(a, 0) + 1

    if not run:
        print("PLAN (nothing will be written)\n")
        print(f"  issues to assign : {len(items)} of {len(B.build(None))}")
        for k, v in sorted(per.items(), key=lambda t: -t[1]):
            print(f"    {v:>4}  {k}")
        print(f"\n  {len(items)} calls at {A.PACE_S}s "
              f"= ~{len(items) * A.PACE_S / 60:.0f} min")
        print(f"  NOTE: notifies AntePrkacin on {per.get('AntePrkacin', 0)} issues")
        print("\n  run with:  python3 assign.py --run")
        return

    A.TOKEN = A.token()
    state = load()
    todo = [i for i in items if i["src"] not in state["done"]]
    print(f"assigning {len(todo)} of {len(items)} issues "
          f"(~{len(todo) * A.PACE_S / 60:.0f} min)\n", flush=True)
    t0 = time.time()
    for n, it in enumerate(todo, 1):
        num = created[it["src"]]["number"]
        A.req("POST", f"/repos/{A.REPO}/issues/{num}/assignees",
              {"assignees": it["assignees"]})
        state["done"].append(it["src"])
        save(state)
        print(f"  [{n:>3}/{len(todo)}] #{num:<4} {it['src']:<7} <- "
              f"{', '.join(it['assignees'])}", flush=True)
        time.sleep(A.PACE_S)

    print("\nverifying against the live tracker...", flush=True)
    live = {i["number"]: {a["login"] for a in i["assignees"]}
            for i in A.paged(f"/repos/{A.REPO}/issues?state=all")}
    bad = []
    for it in items:
        num = created[it["src"]]["number"]
        if live.get(num, set()) != set(it["assignees"]):
            bad.append(f"#{num} {it['src']}: live={sorted(live.get(num, []))} "
                       f"expected={sorted(it['assignees'])}")
    if bad:
        for b in bad[:20]:
            print(f"  MISMATCH {b}")
        raise SystemExit(f"{len(bad)} mismatch(es)")
    print(f"  all {len(items)} match")
    print(f"\nDONE in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
