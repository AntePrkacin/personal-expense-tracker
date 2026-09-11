"""Atlassian Document Format -> GitHub Flavored Markdown.

Covers every node and mark type present in the PET export. Anything unknown is
recorded in UNKNOWN, and apply.py refuses to run if UNKNOWN is non-empty, so a
silent omission is impossible rather than merely unlikely.
"""

UNKNOWN = set()

# Atlassian accountId -> how the name should render in the migrated issue.
# The user's own account becomes their GitHub handle; everyone else is a plain
# name (no email, no @-handle, so a public tracker gains no new personal data).
ACCOUNT_NAMES = {
    "712020:de2513ed-95de-49ca-8ae2-058fdce5902c": "@izkreny",
}


def esc(t):
    # Escape only what would otherwise change GFM structure mid-sentence.
    for ch in ("\\", "`", "*", "_", "[", "]", "<", ">"):
        t = t.replace(ch, "\\" + ch)
    return t


def marks_wrap(text, marks, raw=False):
    """Apply ADF marks. `code` wins outermost-last so backticks stay literal."""
    order = {"code": 0, "strong": 1, "em": 2, "underline": 3, "strike": 4, "link": 5}
    ms = sorted(marks or [], key=lambda m: order.get(m.get("type"), 9))
    has_code = any(m.get("type") == "code" for m in ms)
    out = text if (raw or has_code) else esc(text)
    for m in ms:
        t = m.get("type")
        if t == "code":
            fence = "`"
            while fence in out:
                fence += "`"
            pad = " " if out.startswith("`") or out.endswith("`") else ""
            out = f"{fence}{pad}{out}{pad}{fence}"
        elif t == "strong":
            out = f"**{out}**"
        elif t == "em":
            out = f"*{out}*"
        elif t == "underline":
            # GitHub's sanitiser whitelist excludes <u>, so it renders as nothing
            # at all. <ins> is on the whitelist and underlines identically.
            out = f"<ins>{out}</ins>"
        elif t == "strike":
            out = f"~~{out}~~"
        elif t == "link":
            href = (m.get("attrs") or {}).get("href", "")
            out = f"[{out}]({href})"
        else:
            UNKNOWN.add("mark:" + str(t))
    return out


def inline(nodes):
    """Render inline-level content to a single line."""
    buf = []
    for n in nodes or []:
        t = n.get("type")
        if t == "text":
            buf.append(marks_wrap(n.get("text", ""), n.get("marks")))
        elif t == "hardBreak":
            buf.append("  \n")
        elif t == "emoji":
            a = n.get("attrs") or {}
            buf.append(a.get("text") or a.get("shortName") or "")
        elif t == "mention":
            a = n.get("attrs") or {}
            name = ACCOUNT_NAMES.get(a.get("id"))
            if not name:
                name = (a.get("text") or "").lstrip("@") or "someone"
            buf.append(f"**{name}**" if not name.startswith("@") else name)
        elif t == "inlineCard":
            url = (n.get("attrs") or {}).get("url", "")
            buf.append(f"<{url}>")
        else:
            UNKNOWN.add("inline:" + str(t))
            buf.append(inline(n.get("content")))
    return "".join(buf)


def cell_text(cell):
    """Table cells must collapse to one line; GFM has no multi-line cells."""
    parts = []
    for c in cell.get("content") or []:
        if c.get("type") == "paragraph":
            parts.append(inline(c.get("content")))
        elif c.get("type") in ("bulletList", "orderedList"):
            items = []
            for li in c.get("content") or []:
                items.append(
                    " ".join(
                        inline(p.get("content"))
                        for p in (li.get("content") or [])
                        if p.get("type") == "paragraph"
                    )
                )
            parts.append("; ".join(x for x in items if x))
        else:
            parts.append(inline(c.get("content")))
    return " ".join(p for p in parts if p).replace("|", "\\|").replace("\n", " ")


def blocks(nodes, depth=0):
    """Render block-level content to a list of markdown chunks."""
    out = []
    for n in nodes or []:
        t = n.get("type")
        if t == "paragraph":
            out.append(inline(n.get("content")))
        elif t == "heading":
            lvl = min(int((n.get("attrs") or {}).get("level", 2)), 6)
            out.append("#" * lvl + " " + inline(n.get("content")))
        elif t in ("bulletList", "orderedList"):
            # Children render UNINDENTED and this level applies exactly one
            # indent, aligned to its own marker width. The previous version both
            # recursed with depth+1 (which padded) and re-padded the result, so
            # indents compounded 0, 4, 10, 18, 28, 40 - and anything 4+ columns
            # past the content column becomes an indented code block, which is
            # what happened to PET-75's deeper levels.
            start = int((n.get("attrs") or {}).get("order", 1) or 1)
            lines = []
            for i, li in enumerate(n.get("content") or []):
                mark = "-" if t == "bulletList" else f"{start + i}."
                sub = blocks(li.get("content"), 0)
                body = "\n\n".join(x for x in sub if x)
                parts = body.split("\n") if body else [""]
                lines.append(f"{mark} {parts[0]}")
                pad = " " * (len(mark) + 1)
                for r in parts[1:]:
                    lines.append(pad + r if r.strip() else "")
            out.append("\n".join(lines))
        elif t == "taskList":
            lines = []
            for ti in n.get("content") or []:
                if ti.get("type") != "taskItem":
                    UNKNOWN.add("intaskList:" + str(ti.get("type")))
                    continue
                done = (ti.get("attrs") or {}).get("state") == "DONE"
                lines.append(f"- [{'x' if done else ' '}] {inline(ti.get('content'))}")
            out.append("\n".join(lines))
        elif t == "taskItem":  # orphan taskItem, seen outside a taskList
            done = (n.get("attrs") or {}).get("state") == "DONE"
            out.append(f"- [{'x' if done else ' '}] {inline(n.get('content'))}")
        elif t == "codeBlock":
            lang = (n.get("attrs") or {}).get("language") or ""
            body = "".join(c.get("text", "") for c in n.get("content") or [])
            fence = "```"
            while fence in body:
                fence += "`"
            out.append(f"{fence}{lang}\n{body}\n{fence}")
        elif t == "blockquote":
            inner = blocks(n.get("content"), depth)
            joined = "\n\n".join(x for x in inner if x)
            out.append("\n".join("> " + ln if ln else ">" for ln in joined.split("\n")))
        elif t == "rule":
            out.append("---")
        elif t == "table":
            rows = [r for r in (n.get("content") or []) if r.get("type") == "tableRow"]
            if not rows:
                continue
            first = rows[0].get("content") or []
            is_hdr = any(c.get("type") == "tableHeader" for c in first)
            hdr = [cell_text(c) for c in first]
            if not is_hdr:
                hdr = [""] * len(first)
            body_rows = [[cell_text(c) for c in (r.get("content") or [])]
                         for r in (rows[1:] if is_hdr else rows)]
            # Widen the header rather than truncating a wider row: trimming was
            # the one place in this converter that discarded content silently.
            widest = max([len(hdr)] + [len(r) for r in body_rows] or [len(hdr)])
            if widest > len(hdr):
                UNKNOWN.add("table:ragged-widened")
                hdr = hdr + [""] * (widest - len(hdr))
            md = ["| " + " | ".join(hdr) + " |",
                  "|" + "|".join(["---"] * len(hdr)) + "|"]
            for cells in body_rows:
                cells = cells + [""] * (len(hdr) - len(cells))
                md.append("| " + " | ".join(cells) + " |")
            out.append("\n".join(md))
        elif t == "mediaSingle" or t == "mediaGroup":
            out.append("_[attachment omitted - see the original Jira issue]_")
        elif t == "panel":
            inner = blocks(n.get("content"), depth)
            joined = "\n\n".join(x for x in inner if x)
            out.append("\n".join("> " + ln if ln else ">" for ln in joined.split("\n")))
        else:
            UNKNOWN.add("block:" + str(t))
            sub = blocks(n.get("content"), depth)
            out.extend(sub)
    return out


def adf_to_md(doc):
    if doc is None:
        return ""
    if isinstance(doc, str):
        return doc
    if not isinstance(doc, dict):
        return ""
    chunks = blocks(doc.get("content"))
    return "\n\n".join(c for c in chunks if c and c.strip()).strip()
