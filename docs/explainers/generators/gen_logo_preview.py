#!/usr/bin/env python3
"""Generate the PET-79 logo colour-options preview.

Every colour on the page and every number beside it come from one parse of
globals.css and daisyui/themes.css, so the swatches and the measurements cannot
disagree the way a transcribed table would. Regenerate rather than hand-edit.

The two marks are embedded once as <symbol>s whose paths fill from CSS custom
properties, so each of the twenty cells recolours them without duplicating a
single coordinate of the 60KB wordmark path.
"""
import math
import re
import sys
import xml.etree.ElementTree as ET

SVG = 'http://www.w3.org/2000/svg'
TOKENS = ['primary', 'primary-content', 'secondary', 'neutral', 'neutral-content',
          'warning', 'warning-content', 'error', 'base-100', 'base-200', 'base-content']
BRAND_BOX, BRAND_GLYPH = '#351c75', '#f1c232'
ORDER = ['expensa-light', 'expensa-dark', 'abyss', 'light', 'dark']


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    n = int(h.lstrip('#'), 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]


def oklch_hex(L, C, Hdeg):
    H = math.radians(Hdeg)
    a, b = C * math.cos(H), C * math.sin(H)
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]

    def enc(v):
        v = max(0.0, min(1.0, v))
        v = 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        return round(max(0.0, min(1.0, v)) * 255)

    return '#%02x%02x%02x' % tuple(enc(v) for v in rgb)


def luminance(h):
    r, g, b = (lin(c) for c in hex_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def mix(fg, bg, alpha):
    """`fg` at `alpha` over opaque `bg`, composited in sRGB as a browser would."""
    f, b = hex_rgb(fg), hex_rgb(bg)
    return '#%02x%02x%02x' % tuple(
        round((f[i] * alpha + b[i] * (1 - alpha)) * 255) for i in range(3))


def read_themes(globals_css, themes_css):
    out = {}
    css = open(globals_css, encoding='utf8').read()
    for body in re.findall(r"@plugin\s+'daisyui/theme'\s*\{(.*?)\n\}", css, re.S):
        m = re.search(r"name:\s*'([^']+)'", body)
        if not m:
            continue
        vals = {}
        for t in TOKENS:
            v = re.search(r'--color-' + re.escape(t) + r'\s*:\s*(#[0-9a-fA-F]{6})', body)
            if v:
                vals[t] = v.group(1).lower()
        out[m.group(1)] = vals

    stock = open(themes_css, encoding='utf8').read()
    blocks = dict(re.findall(r'\[data-theme=([a-z0-9-]+)\]\s*\{([^}]*)\}', stock))
    for name in ('abyss', 'light', 'dark'):
        vals = {}
        for t in TOKENS:
            v = re.search(r'--color-' + re.escape(t) +
                          r'\s*:\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)', blocks[name])
            if v:
                vals[t] = oklch_hex(float(v.group(1)) / 100, float(v.group(2)), float(v.group(3)))
        out[name] = vals
    return out


def read_mark(path):
    """viewBox, the wrapper group's transform, and each path's `d` by id.

    The transform matters and is easy to lose: the trimmed files normalise their
    origin with a translate on a group rather than by baking new coordinates into
    every `d`. Reading the paths without it drops the artwork outside the viewBox,
    which clips the wordmark's last letter and shifts the tile.
    """
    root = ET.parse(path).getroot()
    group = root.find('{%s}g' % SVG)
    transform = group.get('transform') if group is not None else None
    if transform is None:
        raise SystemExit('%s: expected a wrapper <g transform>; the trim script writes one' % path)
    return (root.get('viewBox'), transform,
            {p.get('id'): p.get('d') for p in root.iter('{%s}path' % SVG)})


OPTIONS = [
    dict(name='As proposed: primary box, warning $', box='primary', glyph='warning',
         word='primary', ring=False,
         note='The mapping originally asked for. Shown because the failure is worth seeing '
              'rather than reading: the gold and the indigo are close in lightness, so the '
              'glyph sinks into its own tile.'),
    dict(name='E. Fixed brand tile, letters in base-content', box=BRAND_BOX, glyph=BRAND_GLYPH,
         word='base-content', ring=True,
         note='The hybrid. The tile keeps the designed purple and gold exactly, at a fixed '
              '7.94:1 that no theme can touch, while the wordmark takes the page\'s own ink so '
              'it stays readable everywhere. The ring gives the tile an edge on dark themes.'),
    dict(name='A. Fixed brand hexes, with a hairline ring', box=BRAND_BOX, glyph=BRAND_GLYPH,
         word=BRAND_BOX, ring=True,
         note='The artwork exactly as drawn. The ring keeps the tile edge readable where the '
              'purple and the page are nearly the same lightness, but note it does nothing for '
              'the wordmark, which is the same purple.'),
    dict(name='B. primary box, primary-content $', box='primary', glyph='primary-content',
         word='primary', ring=False,
         note='Fully theme-aware, and the one pairing daisyUI itself guarantees. It is also '
              'what LogoLockup already does today, so only the glyph would change.'),
    dict(name='C. warning box, neutral $', box='warning', glyph='neutral',
         word='primary', ring=False,
         note='Keeps gold prominent and measures best of the themed options, but inverts the '
              'design: a gold tile carrying a dark glyph.'),
    dict(name='D. Fixed brand hexes, no ring', box=BRAND_BOX, glyph=BRAND_GLYPH,
         word=BRAND_BOX, ring=False,
         note='The artwork with nothing added at all.'),
]

CSS = """
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.5rem 4rem;
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #f6f7f9; color: #14181f;
  }
  header, .option { max-width: 70rem; margin-left: auto; margin-right: auto; }
  header { margin-bottom: 2rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .6rem; }
  header p { margin: .4rem 0; max-width: 62rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .option {
    margin-bottom: 1.75rem; padding: 1.25rem 1.25rem 1.5rem;
    background: #fff; border: 1px solid #e2e6ec; border-radius: 14px;
  }
  .option h2 { font-size: 1.06rem; margin: 0 0 .35rem; display: flex; gap: .6rem; align-items: center; }
  .note { margin: 0 0 1.1rem; opacity: .8; max-width: 60rem; }
  .badge { font-size: .68rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
           padding: .18rem .52rem; border-radius: 999px; white-space: nowrap; }
  .badge.good { background: #dcfce7; color: #14532d; }
  .badge.bad { background: #fee2e2; color: #7f1d1d; }
  /* Five themes, one row: comparing them side by side is the whole point, and a
     wrapped fifth cell reads as a separate group. */
  .grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .8rem; }
  @media (max-width: 1180px) {
    .grid { grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); }
  }
  .cell { border: 1px solid #e2e6ec; border-radius: 11px; overflow: hidden; }
  .cellhead { font-size: .7rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
              padding: .5rem .7rem; color: #64707f; }
  .stage { padding: 1rem .8rem 1.1rem; display: flex; flex-direction: column; gap: .95rem; }
  .logo { width: 100%; height: auto; display: block; }
  .tilerow { display: flex; align-items: center; gap: .7rem; flex-wrap: wrap; }
  /* The box path's corner arc is 16.5725 units in a 99.4331 viewBox, which is exactly
     1/6 of the tile. A percentage radius therefore matches the artwork at every size on
     its own, where three hardcoded pixel values matched it at none. */
  .tilewrap { position: relative; display: inline-flex; border-radius: 16.6667%; }

  /* The ring has to be an overlay, not an inset shadow. An inset box-shadow paints
     BEHIND the element's content, and the content here is an opaque square covering the
     whole box, so the ring would be invisible - which is exactly the bug that hid it
     until the artwork was aligned. A pseudo-element composites over the tile instead. */
  .tilewrap.ring::after {
    content: ''; position: absolute; inset: 0; border-radius: inherit;
    border: 1px solid var(--ring); pointer-events: none;
  }
  .icon { display: block; width: 44px; height: 44px; }
  .small .icon { width: 26px; height: 26px; }
  .tiny .icon { width: 16px; height: 16px; }
  .onbase { display: inline-flex; align-items: center; gap: .42rem; padding: .35rem .5rem; border-radius: 8px; }
  .baselabel { font-size: .61rem; opacity: .8; }
  .metrics { list-style: none; margin: 0; padding: .55rem .7rem .7rem; font-size: .735rem; }
  .metrics li { padding: .12rem 0; }
  .metrics .pass { color: #15803d; }
  .metrics .fail { color: #b91c1c; font-weight: 600; }
  .floor { color: #8a94a2; font-weight: 400; }
  @media (prefers-color-scheme: dark) {
    body { background: #14181f; color: #e7eaf0; }
    .option { background: #1b2027; border-color: #2b323c; }
    .cell { border-color: #2b323c; }
    .cellhead { color: #9aa4b2; }
    .metrics .pass { color: #4ade80; }
    .metrics .fail { color: #f87171; }
    .floor { color: #7c8695; }
  }
"""

HEAD_COMMENT = """<!--
  PET-79. Four candidate colour mappings for the Spendifico mark, drawn under all five
  themes the ticket ships, at the three sizes the app paints the tile at.

  Unlike its sibling explainers this page loads NOTHING: no daisyUI, no Tailwind, no CDN,
  no network at all. It needs only colour values and two vector paths. The theme blocks
  below are therefore plain custom properties rather than daisyUI themes, which is why
  this file is not bound by the rule that an explainer's style block must match the
  @plugin blocks in globals.css token for token: it carries a subset, for one purpose.

  Every value here and every figure beside it were produced by one script from one parse
  of frontend/src/app/globals.css and node_modules/daisyui/themes.css, so the swatches
  and the measurements cannot drift apart. Regenerate rather than hand-edit.

  The floors: 3:1 for the $ on its box and for the letters against the page, the WCAG
  floor for non-text and large graphical objects. 1.5:1 for the box against the page is
  NOT a WCAG number - it is roughly where the tile stops having a visible edge, which is
  a judgement this page exists to let a human make by eye.
-->"""


def main():
    globals_css, themes_css, icon_svg, logo_svg, out_path = sys.argv[1:6]
    themes = read_themes(globals_css, themes_css)
    icon_vb, icon_tf, icon_d = read_mark(icon_svg)
    logo_vb, logo_tf, logo_d = read_mark(logo_svg)

    theme_css = []
    for name in ORDER:
        decls = '\n'.join('    --%s: %s;' % (k, v) for k, v in sorted(themes[name].items()))
        theme_css.append('  [data-theme="%s"] {\n%s\n  }' % (name, decls))

    def resolve(spec, t):
        return spec if spec.startswith('#') else t[spec]

    sections = []
    summary = []
    for opt in OPTIONS:
        cells, any_fail = [], False
        summary.append(opt['name'])
        for name in ORDER:
            t = themes[name]
            box, glyph, word = (resolve(opt[k], t) for k in ('box', 'glyph', 'word'))
            on_box = contrast(glyph, box)
            word_vs = min(contrast(word, t['base-100']), contrast(word, t['base-200']))

            # Where a ring is drawn, the tile's edge is the RING against the page, not the
            # fill against the page. Measuring the fill would fail exactly the options whose
            # ring exists to fix it, so composite the ring over the box and measure that.
            if opt['ring']:
                edge = mix(t['base-content'], box, 0.22)
                edge_label = 'ring vs the page'
            else:
                edge = box
                edge_label = 'box vs the page'
            vs_page = min(contrast(edge, t['base-100']), contrast(edge, t['base-200']))

            summary.append('   %-14s $ on box %5.2f   %-16s %5.2f   letters %5.2f'
                           % (name, on_box, edge_label, vs_page, word_vs))

            metrics = []
            for value, floor, label in ((on_box, 3.0, '$ on the box'),
                                        (vs_page, 1.5, edge_label),
                                        (word_vs, 3.0, 'letters vs the page')):
                ok = value >= floor
                any_fail = any_fail or not ok
                metrics.append('<li class="%s"><b>%.2f:1</b> %s <span class="floor">needs %.1f:1</span></li>'
                               % ('pass' if ok else 'fail', value, label, floor))

            # The ring is painted with the very hex the metric above measured, so the
            # figure and the pixel cannot disagree.
            ring_cls = ' ring' if opt['ring'] else ''
            ring = ('--ring:%s' % edge) if opt['ring'] else ''
            style = '--box:%s; --glyph:%s; --word:%s' % (box, glyph, word)
            def tile(size_cls, label):
                aria = ('role="img" aria-label="%s"' % label) if label else 'aria-hidden="true"'
                return ('<span class="tilewrap%s%s" style="%s">'
                        '<svg class="icon" viewBox="%s" %s style="%s"><use href="#mark-icon"/></svg>'
                        '</span>' % (size_cls, ring_cls, ring, icon_vb, aria, style))

            cells.append(
                '<div class="cell" data-theme="%s">'
                '<div class="cellhead">%s</div>'
                '<div class="stage" style="background:%s">'
                '<svg class="logo" viewBox="%s" role="img" aria-label="Spendifico lockup on %s"'
                ' style="%s"><use href="#mark-logo"/></svg>'
                '<div class="tilerow">%s%s'
                '<span class="onbase" style="background:%s">%s'
                '<span class="baselabel" style="color:%s">16px, on base-200</span></span>'
                '</div></div>'
                '<ul class="metrics">%s</ul></div>'
                % (name, name, t['base-100'], logo_vb, name, style,
                   tile('', 'tile at 44px'), tile(' small', ''),
                   t['base-200'], tile(' tiny', ''), t['base-content'],
                   ''.join(metrics)))

        badge = ('<span class="badge bad">fails somewhere</span>' if any_fail
                 else '<span class="badge good">passes everywhere</span>')
        sections.append('<section class="option"><h2>%s %s</h2><p class="note">%s</p>'
                        '<div class="grid">%s</div></section>'
                        % (opt['name'], badge, opt['note'], ''.join(cells)))

    symbols = (
        '<svg width="0" height="0" style="position:absolute" aria-hidden="true">'
        '<symbol id="mark-icon" viewBox="%s"><g transform="%s">'
        '<path d="%s" fill="var(--box)" fill-rule="evenodd"/>'
        '<path d="%s" fill="var(--glyph)" fill-rule="nonzero"/></g></symbol>'
        '<symbol id="mark-logo" viewBox="%s"><g transform="%s">'
        '<path d="%s" fill="var(--word)" fill-rule="nonzero"/>'
        '<path d="%s" fill="var(--box)" fill-rule="evenodd"/>'
        '<path d="%s" fill="var(--glyph)" fill-rule="nonzero"/></g></symbol></svg>'
        % (icon_vb, icon_tf, icon_d['box'], icon_d['glyph'],
           logo_vb, logo_tf, logo_d['wordmark'], logo_d['box'], logo_d['glyph']))

    header = (
        '<header><h1>Logo tile colour options, PET-79</h1>'
        '<p>The mapping originally proposed, then five candidates, each drawn under all five '
        'themes the ticket ships, at the three sizes the app paints the tile at: the '
        'access-screen lockup, the sidebar tile, and 16px for the favicon.</p>'
        '<p>Each cell reports three measurements. The <b>$ on the box</b> and the <b>letters '
        'against the page</b> are held to 3:1, the WCAG floor for non-text and large graphical '
        'objects. The <b>box against the page</b> is held to 1.5:1, which is not a WCAG number: '
        'it is roughly where the tile stops having a visible edge. Read that one by eye and '
        'treat the figure as a hint.</p>'
        '<p><b>The favicon is a separate case whatever you pick.</b> '
        '<code>frontend/src/app/icon.svg</code> is served as a static file outside the page, so '
        'no theme value can reach it. It keeps literal hexes regardless.</p></header>')

    html = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            '<title>Logo tile colour options preview</title>\n\n%s\n\n<style>\n'
            '  :root { color-scheme: light dark; }\n%s\n%s</style>\n</head>\n<body>\n\n'
            '%s\n\n%s\n\n%s\n\n</body>\n</html>\n'
            % (HEAD_COMMENT, '\n'.join(theme_css), CSS, symbols, header, ''.join(sections)))

    open(out_path, 'w', encoding='utf8').write(html)
    print('wrote %s (%.0f KB)\n' % (out_path, len(html) / 1024))
    print('\n'.join(summary))


if __name__ == '__main__':
    main()
