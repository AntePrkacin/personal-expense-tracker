#!/usr/bin/env python3
"""Generate docs/explainers/font-pairing-review.html for PET-79.

Four things to judge by eye, in this order:

  1. the lockup in each display candidate, all matched to the artwork's cap height
     so density is the only variable
  2. a letter-spacing ladder, since tracking is a logo-only lever
  3. page titles at the app's real sizes and weights, because a display face that
     flatters a wordmark can still fail at 20px in a heading
  4. body candidates against a money column, because four of the nicest sans faces
     on Google Fonts carry no tabular figures and this app depends on them

Every font-size in section 1 is computed from the family's own cap-height metric
(read out of its OS/2 table), never guessed, so the comparison is fair.

Usage: gen_font_review.py <logo.trimmed.svg> <out.html> <font-metrics.json>
"""
import json
import sys
import xml.etree.ElementTree as ET

SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)

# expensa-light, which is the default theme, under the mapping the product owner chose:
# a `primary` tile carrying a `warning` dollar sign, wordmark in `primary`.
BOX = '#4f46e5'
GLYPH = '#e0a020'
WORD = '#4f46e5'

TILE = 44.0                     # px, the sidebar tile's size
CAP_OVER_TILE = 61.1094 / 99.4331   # the artwork's cap height as a fraction of its tile

DISPLAY_NOTES = {
    'IM Fell English SC': 'Your artwork\'s own face. One weight only, and the densest here.',
    'EB Garamond': 'The same Garamond lineage, much more open. Five real weights to 800.',
    'Cormorant Garamond': 'The airiest option. High contrast, delicate, five weights.',
    'Cinzel': 'Roman inscriptional capitals, wide and open. Six weights to 900.',
    'Spectral': 'A screen-first serif. Open, even, and the only one with uniform digits.',
    'Crimson Pro': 'Book serif with the most air around its caps. Eight weights.',
    'Playfair Display': 'High contrast and quite dense. Six weights to 900.',
    'Lora': 'Brushed contemporary serif, moderate density. Four weights.',
}

BODY_NOTES = {
    'Inter': 'What ships today. Tabular figures, nine weights.',
    'Manrope': 'Geometric and open, close to Quicksand\'s feel with tabular figures.',
    'Figtree': 'Friendly geometric sans with tabular figures.',
    'Rubik': 'Slightly rounded, warm, tabular figures.',
    'Quicksand': 'What you use in the presentation. NO tabular figures.',
    'Nunito': 'Rounded and friendly, closest to Quicksand. NO tabular figures.',
}

AMOUNTS = ['1,234.56', '999.00', '11,111.11', '80,000.00', '7.77', '100,000.00']
TRACKING = ['0', '0.02em', '0.04em', '0.06em', '0.08em', '0.12em']

CSS = """
  * { box-sizing: border-box; }
  body { margin:0; padding:2rem 1.6rem 5rem; background:#f6f7f9; color:#14181f;
         font:15px/1.55 ui-sans-serif, system-ui, sans-serif; }
  header, section { max-width:74rem; margin-left:auto; margin-right:auto; }
  h1 { font-size:1.55rem; margin:0 0 .6rem; }
  h2 { font-size:1.12rem; margin:0 0 .2rem; }
  header p, .lede { margin:.4rem 0; max-width:62rem; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.9em; }
  section { background:#fff; border:1px solid #e2e6ec; border-radius:14px;
            padding:1.3rem 1.4rem 1.6rem; margin-bottom:1.6rem; }
  .row { border-top:1px solid #eef1f5; padding:1.05rem 0 .9rem; }
  .row:first-of-type { border-top:0; }
  .name { font:600 12.5px/1 system-ui; letter-spacing:.03em; text-transform:uppercase;
          color:#5b6674; margin-bottom:.15rem; }
  .why { font-size:12.5px; color:#7b8694; margin:0 0 .7rem; }
  .warn { color:#b3261e; font-weight:600; }
  .lockup { display:flex; align-items:center; }
  .tile { display:inline-flex; align-items:center; justify-content:center;
          border-radius:16.6667%; flex:0 0 auto; }
  .word { white-space:nowrap; }
  .ref { display:block; height:44px; width:auto; }
  .ladder .lockup { margin-bottom:.45rem; }
  .tick { font:11px ui-monospace,monospace; color:#96a0ad; margin-left:.7rem; }
  .titles > div { margin:.28rem 0; color:#14181f; }
  .cols { display:grid; grid-template-columns:1fr 220px; gap:1.6rem; align-items:start; }
  .money { border-collapse:collapse; width:100%; }
  .money td { padding:1px 0; font-variant-numeric:tabular-nums; }
  .money td.a { text-align:right; font-weight:600; }
  .flag { display:inline-block; font:700 10px/1 system-ui; letter-spacing:.05em;
          text-transform:uppercase; padding:.22rem .45rem; border-radius:999px; margin-left:.5rem; }
  .flag.ok { background:#dcfce7; color:#14532d; }
  .flag.no { background:#fee2e2; color:#7f1d1d; }
  @media (prefers-color-scheme: dark) {
    body { background:#14181f; color:#e7eaf0; }
    section { background:#1b2027; border-color:#2b323c; }
    .row { border-color:#252b34; }
    .name { color:#9aa4b2; } .why { color:#7c8695; }
    .titles > div { color:#e7eaf0; }
    .warn { color:#f87171; }
  }
"""


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;')


def lockup(family, size_px, tracking='0', word='PENDIFICO'):
    return (
        '<div class="lockup" style="font-family:\'' + family + '\',serif">'
        '<span class="tile" style="width:' + str(TILE) + 'px;height:' + str(TILE) + 'px;'
        'background:' + BOX + ';color:' + GLYPH + ';'
        'font-size:' + ('%.2f' % (size_px * 1.02)) + 'px">$</span>'
        '<span class="word" style="color:' + WORD + ';font-size:' + ('%.2f' % size_px) + 'px;'
        'letter-spacing:' + tracking + ';margin-left:' + ('%.2f' % (TILE * 0.118)) + 'px">'
        + word + '</span></div>')


def main():
    logo_svg, out_path, metrics_path = sys.argv[1:4]
    metrics = json.load(open(metrics_path))

    root = ET.parse(logo_svg).getroot()
    ref = ('<svg class="ref" viewBox="' + root.get('viewBox') + '">'
           + ''.join(ET.tostring(c, encoding='unicode') for c in root) + '</svg>')

    display = [f for f in DISPLAY_NOTES if f in metrics]
    body = [f for f in BODY_NOTES if f in metrics]
    families = sorted(set(display) | set(body))
    link = ('https://fonts.googleapis.com/css2?'
            + '&'.join('family=' + f.replace(' ', '+') + ':wght@400;500;600;700'
                       if metrics[f]['weights'] > 1 else 'family=' + f.replace(' ', '+')
                       for f in families)
            + '&display=block')

    def size_for(f):
        return TILE * CAP_OVER_TILE / metrics[f]['cap_em']

    # 1. the lockup
    rows = ['<div class="row"><div class="name">Your artwork, for reference</div>'
            '<p class="why">Vector paths, in the original purple and gold.</p>' + ref + '</div>']
    for f in display:
        w = metrics[f]['weights']
        note = DISPLAY_NOTES[f]
        if w == 1:
            note += ' <span class="warn">Single weight, so bold headings would be synthesized.</span>'
        rows.append('<div class="row"><div class="name">' + esc(f) + '</div>'
                    '<p class="why">' + note + ' cap/em ' + ('%.4f' % metrics[f]['cap_em'])
                    + ', so font-size is ' + ('%.1f' % size_for(f)) + 'px at a 44px tile.</p>'
                    + lockup(f, size_for(f)) + '</div>')
    sec_lockup = ('<section><h2>1. The lockup</h2><p class="lede">Every candidate is set to the '
                  'font-size that matches your artwork\'s cap height exactly, computed from that '
                  'family\'s own metrics. Density and letterform are therefore the only things '
                  'differing.</p>' + ''.join(rows) + '</section>')

    # 2. tracking ladder
    ladder = []
    for f in display:
        cells = ''.join('<div class="lockup" style="align-items:center">'
                        + lockup(f, size_for(f), t)[len('<div class="lockup" style="font-family:\''
                                                        + f + '\',serif">'):-len('</div>')]
                        + '<span class="tick">letter-spacing: ' + t + '</span></div>'
                        for t in TRACKING)
        ladder.append('<div class="row ladder" style="font-family:\'' + f + '\',serif">'
                      '<div class="name">' + esc(f) + '</div>' + cells + '</div>')
    sec_track = ('<section><h2>2. Letter-spacing, a logo-only lever</h2>'
                 '<p class="lede">Tracking applies to the wordmark alone and changes nothing '
                 'about body or heading text, so it is free to tune. Anything from 0.04em opens '
                 'a dense face noticeably.</p>' + ''.join(ladder) + '</section>')

    # 3. real headings
    heads = []
    for f in display:
        w = metrics[f]['weights']
        bold = '700' if w > 1 else '400'
        faux = ('' if w > 1 else
                ' <span class="warn">rendered at 400; a browser would fake 700 here</span>')
        heads.append(
            '<div class="row"><div class="name">' + esc(f) + faux + '</div>'
            '<div class="titles" style="font-family:\'' + f + '\',serif">'
            '<div style="font-size:30px;font-weight:' + bold + '">Dashboard</div>'
            '<div style="font-size:24px;font-weight:' + bold + '">Transactions</div>'
            '<div style="font-size:20px;font-weight:' + bold + '">Add transaction</div>'
            '<div style="font-size:18px;font-weight:600">Recent transactions</div>'
            '<div style="font-size:36px;font-weight:' + bold + '">1,234.56</div>'
            '</div></div>')
    sec_titles = ('<section><h2>3. The same face doing the app\'s real headings</h2>'
                  '<p class="lede">These are the sizes and weights actually in the code: '
                  '<code>font-display text-2xl font-bold</code> appears twelve times, '
                  '<code>text-3xl font-bold</code> three times, and one '
                  '<code>text-4xl font-bold tabular-nums</code> on the transaction amount. '
                  'A face with one weight has to fake every one of them.</p>'
                  + ''.join(heads) + '</section>')

    # 4. body candidates
    bodies = []
    for f in body:
        tab = metrics[f]['tnum']
        flag = ('<span class="flag ok">tabular figures</span>' if tab
                else '<span class="flag no">no tabular figures</span>')
        money = ''.join('<tr><td class="a">' + a + '</td></tr>' for a in AMOUNTS)
        bodies.append(
            '<div class="row"><div class="name">' + esc(f) + flag + '</div>'
            '<p class="why">' + BODY_NOTES[f] + '</p>'
            '<div class="cols" style="font-family:\'' + f + '\',sans-serif">'
            '<div style="font-size:15px">Groceries, dining out and transport made up most of '
            'this period. You have spent 68% of your budget with nine days to go, which is '
            'slightly ahead of the same point last period.'
            '<div style="font-size:13px;margin-top:.5rem;opacity:.75">'
            'Supporting copy at 13px, the size the app uses for table rows and hints.</div></div>'
            '<table class="money"><tbody>' + money + '</tbody></table>'
            '</div></div>')
    sec_body = ('<section><h2>4. Body candidates, judged on a money column</h2>'
                '<p class="lede">The column has <code>tabular-nums</code> applied, exactly as '
                '<code>TransactionRow</code> does. Where a family has no <code>tnum</code> the '
                'class does nothing and the digits stay ragged, so watch whether the figures '
                'form clean columns.</p>' + ''.join(bodies) + '</section>')

    html = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            '<title>Font pairing review</title>\n\n'
            '<!--\n'
            '  PET-79. Candidate display and body faces for the app, and for the wordmark, which\n'
            '  the product owner wants set in the same family as the page titles.\n\n'
            '  This page DOES load from the network: judging a typeface requires the real\n'
            '  outlines, and embedding eight families would add well over a megabyte. Its\n'
            '  sibling logo-tile-options-preview.html needs only colour values and is therefore\n'
            '  fully self-contained; this one cannot be.\n\n'
            '  Regenerate with docs/explainers/generators/gen_font_review.py rather than editing.\n'
            '  Every font-size in section 1 is derived from that family\'s own OS/2 cap-height,\n'
            '  so the faces are compared at equal cap height rather than at equal font-size,\n'
            '  which would flatter whichever family happens to have the largest caps.\n'
            '-->\n\n'
            '<link rel="stylesheet" href="' + link + '">\n'
            '<style>' + CSS + '</style>\n</head>\n<body>\n\n'
            '<header><h1>Font pairing review, PET-79</h1>'
            '<p>The brief: a display face for page titles <em>and</em> the wordmark, less dense '
            'than IM Fell English SC, plus a body face. The lockup is drawn in the mapping you '
            'chose, a <code>primary</code> tile with a <code>warning</code> dollar sign.</p>'
            '<p>Two hard constraints came out of measuring the fonts themselves. A display face '
            'wants <b>more than one weight</b>, because 28 of the 29 <code>font-display</code> '
            'call sites pair it with <code>font-bold</code> or <code>font-semibold</code>. And a '
            'body face wants a <b><code>tnum</code> feature</b>, because six call sites rely on '
            '<code>tabular-nums</code> and it is inert without one.</p></header>\n\n'
            + sec_lockup + sec_track + sec_titles + sec_body
            + '\n</body>\n</html>\n')

    open(out_path, 'w', encoding='utf8').write(html)
    print('wrote ' + out_path + ' (%.0f KB)' % (len(html) / 1024))
    print('\ndisplay candidates, font-size at a 44px tile:')
    for f in display:
        print('   %-22s %-6s weights=%-2d  %.1fpx' % (
            f, 'tnum' if metrics[f]['tnum'] else '-', metrics[f]['weights'], size_for(f)))
    print('\nbody candidates:')
    for f in body:
        print('   %-22s %s' % (f, 'tabular' if metrics[f]['tnum'] else 'NO TABULAR FIGURES'))


if __name__ == '__main__':
    main()
