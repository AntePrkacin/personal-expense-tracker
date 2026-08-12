# The PET-79 planning generators

These produced the evidence PET-79's logo and typography decisions were made against. Run them from
the repo root; each takes its inputs as arguments.

Nothing here is wired into a build, a lint or CI, the same call `docs/explainers/icon-set/` makes and
for the same reason.

## What is ported to Node, and what is not

PET-79's plan asked for all four Python scripts to be ported "so the repo carries one pattern for
this job rather than two". **One is ported and three are not**, which is a narrowing of that item
rather than a completion of it, and the reasoning is worth having rather than the consistency.

| Script                | Language | Status                                                                                 |
| --------------------- | -------- | -------------------------------------------------------------------------------------- |
| `font-probe.js`       | Node     | **Ported**, and self-validating - see below                                            |
| `font_probe.py`       | Python   | Kept as the reference the port checks itself against                                   |
| `trim_svg.py`         | Python   | **Not ported.** Needs an XML DOM; Node has no stdlib equivalent                        |
| `gen_logo_preview.py` | Python   | **Not ported.** Same, and its colour maths is already ported where it matters          |
| `gen_font_review.py`  | Python   | **Not ported.** Same                                                                   |

Three reasons, in the order they mattered.

**Node has no stdlib XML parser.** `trim_svg.py` and both page generators use `xml.etree`, and the
trimmer's whole guarantee is that *every surviving path keeps its `d` byte-for-byte*. Reproducing
that with regexes is how a coordinate silently drifts, and the two trimmed SVGs are now load-bearing:
`components/LogoLockup.tsx` derives three measured ratios from them and `app/icon.svg` ships their
paths verbatim. A port that changed one byte of `SPENDIFICO_ICON.trimmed.svg` would mis-size the
brand mark, and no gate in this repo would notice. The alternative was adding an XML dependency for
a docs generator, which is worse.

**The half of `gen_logo_preview.py` with ongoing value is already ported**, into
`frontend/src/lib/themeGuard.ts` - the OKLab conversion, the WCAG formula and the alpha compositing,
with a test suite around them and a browser cross-check behind them. That is where colour maths
belongs in this repo. What stays in Python is the page layout around it.

**These are one-shot planning probes rather than living generators**, which is the distinction the
plan's "one pattern" framing misses. `icon-set/` and `category-palette/` generate pages that change
with the data behind them, so they have to be runnable by whoever changes it. These three produced
`SPENDIFICO_*.trimmed.svg`, `font-pairing-review.html` and `logo-tile-options-preview.html` for
decisions that are now made, recorded and committed. Rewriting 700 lines of working, documented code
to re-emit artifacts that already exist buys consistency and risks the artifacts.

## `font-probe.js`, and why it checks itself

```
node docs/explainers/generators/font-probe.js .            # check, writes nothing
node docs/explainers/generators/font-probe.js . --write    # regenerate font-metrics.json
```

This one **is** ported, because `font-metrics.json` is a live input rather than a finished artifact:
`app/fonts.ts` cites it, the lockup's wordmark font-size is derived from a `cap_em` in it, and
changing the display face means re-deriving every row.

That is also exactly why it validates itself. A wrong table offset does not throw - it yields a
plausible `cap/em`, and a plausible `cap/em` silently mis-sizes the brand mark. So the default mode
re-derives every figure and **fails** if any disagrees with the committed file; `--write` is the only
way to move it. It currently reproduces all 16 families.

**The self-check earned its place on the first run.** The port's first version read the weight count
from the Google Fonts CSS, and `?family=X&display=swap` returns weight 400 only - so every family
probed as having one weight, and the check named all fifteen disagreements. The count comes from the
variable font's own `fvar` weight axis now. Had the check not been there, `font-metrics.json` would
have been overwritten with `weights: 1` everywhere, which is the figure that ruled a whole family
out of the audit.

## The Python three

```
python3 docs/explainers/generators/trim_svg.py <in.svg> <out.svg>
python3 docs/explainers/generators/font_probe.py <cache-dir>
python3 docs/explainers/generators/gen_font_review.py <logo.trimmed.svg> <out.html> <font-metrics.json>
python3 docs/explainers/generators/gen_logo_preview.py <icon.trimmed.svg> <logo.trimmed.svg> <out.html>
```

All four are stdlib-only, so they need no virtualenv and no install.

`trim_svg.py` is the one to read before touching the artwork. It removes three kinds of exporter
geometry, and the second is the one that matters: a stroke-only duplicate of the box outline **in
the box's own colour**, which is invisible until the fill becomes a theme token and then becomes a
hardcoded purple hairline around a themed box. It crops purely in the `viewBox`, so no coordinate is
rewritten.
