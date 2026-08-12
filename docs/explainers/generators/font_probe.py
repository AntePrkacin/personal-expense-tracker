#!/usr/bin/env python3
"""Probe candidate Google Fonts for the two properties that decide PET-79's typography.

  1. cap-height / em, which fixes the exact font-size that makes a text lockup match
     the artwork's cap height (artwork: cap 61.1094 where the tile is 99.4331).
  2. whether the family carries a `tnum` (tabular figures) feature, because this app
     relies on `tabular-nums` in six places and a font without it drops the class
     silently rather than failing.

Also reports whether lowercase is small-caps-only (the SC families), and the advance
widths of `1` against `0`, which is what proportional figures actually look like.
"""
import os
import re
import struct
import subprocess
import sys

DISPLAY = ['IM Fell English SC', 'EB Garamond', 'Cormorant Garamond', 'Cinzel',
           'Spectral', 'Crimson Pro', 'Playfair Display', 'Lora']
BODY = ['Inter', 'Quicksand', 'Nunito', 'Manrope', 'Figtree', 'Rubik',
        'Source Sans 3', 'IBM Plex Sans']

CACHE = sys.argv[1]


def fetch_ttf(family):
    slug = family.replace(' ', '+')
    css_path = os.path.join(CACHE, 'css_' + family.replace(' ', '_') + '.css')
    if not os.path.exists(css_path):
        subprocess.run(['curl', '-sS', '-m', '30', '-o', css_path,
                        'https://fonts.googleapis.com/css2?family=%s&display=swap' % slug],
                       check=True)
    css = open(css_path, encoding='utf8', errors='replace').read()
    urls = re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+\.ttf)\)', css)
    if not urls:
        return None
    ttf = os.path.join(CACHE, family.replace(' ', '_') + '.ttf')
    if not os.path.exists(ttf):
        subprocess.run(['curl', '-sS', '-m', '30', '-o', ttf, urls[0]], check=True)
    return ttf


def tables(data):
    n = struct.unpack('>H', data[4:6])[0]
    out = {}
    for i in range(n):
        off = 12 + i * 16
        tag = data[off:off + 4].decode('latin-1')
        start, length = struct.unpack('>II', data[off + 8:off + 16])
        out[tag] = (start, length)
    return out


def glyph_id(data, tbl, ch):
    """Look up a character in a cmap format-4 subtable."""
    if 'cmap' not in tbl:
        return None
    base = tbl['cmap'][0]
    count = struct.unpack('>H', data[base + 2:base + 4])[0]
    best = None
    for i in range(count):
        rec = base + 4 + i * 8
        pid, eid, off = struct.unpack('>HHI', data[rec:rec + 8])
        if (pid, eid) in ((3, 1), (3, 10), (0, 3), (0, 4)):
            best = base + off
    if best is None:
        return None
    fmt = struct.unpack('>H', data[best:best + 2])[0]
    if fmt == 12:
        # Segmented coverage, used by the variable fonts here. Without this branch
        # Inter and EB Garamond read as having no `$` at all, which is nonsense and
        # would have gone into a table as if it were a fact about the font.
        n_groups = struct.unpack('>I', data[best + 12:best + 16])[0]
        code = ord(ch)
        for i in range(n_groups):
            g = best + 16 + i * 12
            start, end, start_gid = struct.unpack('>III', data[g:g + 12])
            if start <= code <= end:
                return start_gid + (code - start)
        return 0
    if fmt != 4:
        return None
    seg2 = struct.unpack('>H', data[best + 6:best + 8])[0]
    seg = seg2 // 2
    ends = best + 14
    starts = ends + seg2 + 2
    deltas = starts + seg2
    ranges = deltas + seg2
    code = ord(ch)
    for i in range(seg):
        end = struct.unpack('>H', data[ends + i * 2:ends + i * 2 + 2])[0]
        if code > end:
            continue
        start = struct.unpack('>H', data[starts + i * 2:starts + i * 2 + 2])[0]
        if code < start:
            return 0
        delta = struct.unpack('>h', data[deltas + i * 2:deltas + i * 2 + 2])[0]
        ro = struct.unpack('>H', data[ranges + i * 2:ranges + i * 2 + 2])[0]
        if ro == 0:
            return (code + delta) & 0xFFFF
        addr = ranges + i * 2 + ro + (code - start) * 2
        g = struct.unpack('>H', data[addr:addr + 2])[0]
        return 0 if g == 0 else (g + delta) & 0xFFFF
    return 0


def advance(data, tbl, gid):
    if gid is None or 'hhea' not in tbl or 'hmtx' not in tbl:
        return None
    num_h = struct.unpack('>H', data[tbl['hhea'][0] + 34:tbl['hhea'][0] + 36])[0]
    i = min(gid, num_h - 1)
    off = tbl['hmtx'][0] + i * 4
    return struct.unpack('>H', data[off:off + 2])[0]


def probe(family):
    ttf = fetch_ttf(family)
    if not ttf:
        return dict(family=family, error='no ttf in css')
    data = open(ttf, 'rb').read()
    tbl = tables(data)
    upem = struct.unpack('>H', data[tbl['head'][0] + 18:tbl['head'][0] + 20])[0]
    os2 = tbl['OS/2'][0]
    ver = struct.unpack('>H', data[os2:os2 + 2])[0]
    cap = struct.unpack('>h', data[os2 + 88:os2 + 90])[0] if ver >= 2 else 0
    feats = [t for t in ('tnum', 'pnum', 'onum', 'lnum', 'smcp', 'kern', 'liga', 'case')
             if t.encode() in data]
    w0 = advance(data, tbl, glyph_id(data, tbl, '0'))
    w1 = advance(data, tbl, glyph_id(data, tbl, '1'))
    dollar = glyph_id(data, tbl, '$')
    return dict(family=family, upem=upem, cap=cap, cap_em=(cap / upem if cap else None),
                feats=feats, w0=w0, w1=w1, dollar=bool(dollar),
                size_factor=((61.1094 / 99.4331) / (cap / upem)) if cap else None)


def show(title, names):
    print('\n=== %s ===' % title)
    print('%-22s %-8s %-9s %-9s %-7s %s' % ('family', 'cap/em', 'size/tile', 'digits', '$', 'features'))
    print('-' * 96)
    for n in names:
        r = probe(n)
        if r.get('error'):
            print('%-22s %s' % (n, r['error']))
            continue
        if r['w0'] and r['w1']:
            same = r['w0'] == r['w1']
            digits = 'uniform' if same else 'ragged'
            digits += ' %d/%d' % (r['w1'], r['w0'])
        else:
            digits = '?'
        tab = 'tnum' in r['feats']
        print('%-22s %-8s %-9s %-9s %-7s %s%s' % (
            n,
            '%.4f' % r['cap_em'] if r['cap_em'] else '-',
            '%.4f' % r['size_factor'] if r['size_factor'] else '-',
            digits.split()[0],
            'yes' if r['dollar'] else 'NO',
            ' '.join(r['feats']),
            '' if tab or title.startswith('Display') else '   <-- no tabular figures'))


os.makedirs(CACHE, exist_ok=True)
show('Display candidates', DISPLAY)
show('Body candidates', BODY)
