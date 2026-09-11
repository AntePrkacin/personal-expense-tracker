"""Which migration scenario this checkout runs.

The same scripts served two different runs, and the differences are all here
rather than scattered through the code, so a reader can see at a glance which
scenario a checkout is set up for.

**This checkout: tickets only, into the repository that already owns the code.**

`izkreny/spendifico` needed everything, because it started empty: 85 Jira
tickets plus the 85 pull requests rebuilt as issues, since pull requests cannot
be moved between repositories.

This repository already has those 85 pull requests natively, and their whole
discussion with them, so archiving copies of them here would duplicate what is
already the real thing. Only the Jira tickets are new.
"""

REPO = "AntePrkacin/personal-expense-tracker"

# False: this repo already holds the real pull requests. Only Jira tickets are
# migrated, so nothing carries the `pr-archive`, `merged` or `not-merged` labels.
INCLUDE_PR_ARCHIVE = False

# Where the dry run's *illustrative* numbering starts.
#
# It must not overlap the numbers already in use here, or a reviewer cannot tell
# a generated reference from an inherited one. Numbering from 1 put `#41` in an
# epic's checklist while `#41` is also a real pull request in this repository -
# two different meanings, same glyph, in the same file. This repo's highest
# number is 96, so the real run will hand out 97 upward and the dry run says so.
#
# Illustrative only. Nothing in apply.py reads it; the real numbers come back
# from the API.
ILLUSTRATIVE_BASE = 97

# False: leave an inherited `#NN` exactly as its author wrote it.
#
# In `izkreny/spendifico` these had to be rewritten into explicit links to this
# repository, because a bare `#93` there would have resolved against a tracker
# where #93 is an unrelated migrated ticket - confidently wrong.
#
# Here the opposite holds. A bare `#93` resolves to *this* repository's pull
# request #93, which is exactly what the author meant when they typed it. So the
# rewrite is switched off and the references are left native.
LINK_CROSS_REFS = False
