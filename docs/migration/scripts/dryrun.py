"""Render the dry run for human review. Writes only to dryrun/ and the drafts dir.

Numbers shown here are ILLUSTRATIVE. The real run reads every number back from
the GitHub API; nothing in apply.py uses the map built below.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build as B  # noqa: E402
import config as C  # noqa: E402

os.chdir(HERE)

# Derived from the target repo, not hardcoded. A fixed path meant the second
# scenario's dry run silently overwrote the first one's review copy - the output
# looked completely normal, because it was, just into the wrong directory.
DRAFTS = os.path.expanduser(
    "~/.claude/drafts/migration-" + C.REPO.replace("/", "-"))

create = B.build(None)
# Illustrative only, starting at config.ILLUSTRATIVE_BASE so these cannot be
# confused with the numbers already in use in the target repo. apply.py never
# does this - it reads every number back from the API.
illustrative = {it["src"]: C.ILLUSTRATIVE_BASE + n
                for n, it in enumerate(create)}
final = B.build(illustrative)

os.makedirs("dryrun", exist_ok=True)
for old in os.listdir("dryrun"):
    os.remove(os.path.join("dryrun", old))

for it in final:
    num = illustrative[it["src"]]
    with open(f"dryrun/{num:03d}-{it['src']}.md", "w") as fh:
        fh.write(f"<!-- TITLE:  {it['title']}\n")
        fh.write(f"     NUMBER: #{num}   <-- ILLUSTRATIVE; the real run reads this"
                 f" back from the API\n")
        fh.write(f"     STATE:  {it['state']}"
                 f"{' / ' + it['state_reason'] if it['state_reason'] else ''}\n")
        fh.write(f"     LABELS: {', '.join(it['labels'])}\n")
        fh.write(f"     COMMENTS: {len(it['comments'])}\n")
        fh.write(f"     ASSIGNEE: {', '.join(it['assignees']) or '-'}"
                 f"  (only set with --assign)\n")
        if it["children"]:
            fh.write(f"     SUB-ISSUES: {len(it['children'])}\n")
        if it["needs_patch"]:
            fh.write("     BODY PATCHED in phase 4 with real numbers\n")
        fh.write("-->\n\n")
        fh.write(it["body"])
        for i, c in enumerate(it["comments"], 1):
            fh.write(f"\n\n<!-- comment {i} -->\n\n{c}")

D = DRAFTS
os.makedirs(D, exist_ok=True)
rows = [f"# Migration dry run - {C.REPO}", "",
        f"{len(final)} issues, {sum(len(i['comments']) for i in final)} comments. "
        "Nothing written to GitHub yet.", "",
        f"Issue numbers below are **illustrative**, starting at "
        f"#{C.ILLUSTRATIVE_BASE} so they cannot be mistaken for numbers already "
        f"in use. The real run reads each number back from the GitHub API and "
        f"patches the number-bearing bodies afterwards, so nothing depends on "
        f"this arithmetic.", "",
        "| # | Source | State | Cmts | Sub | Assignee | Patched | Title |",
        "|---|---|---|---|---|---|---|---|"]
for it in final:
    rows.append(
        f"| {illustrative[it['src']]} | {it['src']} | {it['state']}"
        f"{'/' + it['state_reason'] if it['state_reason'] else ''} "
        f"| {len(it['comments'])} | {len(it['children']) or ''} "
        f"| {', '.join(it['assignees']) or '-'} "
        f"| {'yes' if it['needs_patch'] else ''} "
        f"| {it['title'].replace('|', chr(92) + '|')[:80]} |")
open(os.path.join(D, "INDEX.md"), "w").write("\n".join(rows) + "\n")

import shutil  # noqa: E402
shutil.rmtree(os.path.join(D, "dryrun"), ignore_errors=True)
shutil.copytree("dryrun", os.path.join(D, "dryrun"))
for f in ("config.py", "adf2md.py", "render.py", "build.py", "apply.py",
          "assign.py", "dryrun.py"):
    shutil.copy(f, os.path.join(D, f))

print(f"issues      : {len(final)}")
print(f"comments    : {sum(len(i['comments']) for i in final)}")
print(f"open/closed : {sum(1 for i in final if i['state'] == 'open')}"
      f"/{sum(1 for i in final if i['state'] == 'closed')}")
print(f"patched     : {sum(1 for i in final if i['needs_patch'])}")
print(f"sub-issues  : {sum(len(i['children']) for i in final)}")
print(f"labels      : {len(B.all_labels(final))}")
print(f"\nwritten to {D} (dry run, index, and every script)")
