#!/usr/bin/env python3
"""Trim the Spendifico marks for use as a themeable inline SVG.

Three kinds of geometry come out, and none of them is a judgement call:

1. Full-canvas rects with `fill-opacity="0.0"`. The exporter's bounding boxes.
   The icon has one, the logo has two.
2. A path with `stroke="#351c75" stroke-width="1.0"` and no fill of its own,
   duplicating the box outline in the box's own colour. It is visible, but all it
   does is fatten the box by 0.5 units per side. It has to go rather than stay:
   once the fill becomes a theme token, a leftover stroke is a hardcoded purple
   hairline around a themed box, and that is a bug nobody would look for.
3. The clip path, which clips to the original canvas and so is a no-op against a
   viewBox strictly inside it.

Every surviving path keeps its `d` byte-for-byte. Cropping is done purely in the
viewBox, so no coordinate is rewritten and nothing can drift.
"""
import sys
import xml.etree.ElementTree as ET

SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
Q = f'{{{SVG}}}'


def is_exporter_bounding_box(el):
    return el.get('fill-opacity') in ('0', '0.0')


def is_redundant_outline(el):
    """Stroke-only duplicate of a filled path, in the same colour."""
    return el.get('stroke') is not None and el.get('fill') is None


def trim(src, dst, view_box, ids):
    tree = ET.parse(src)
    root = tree.getroot()

    for cp in root.findall(f'{Q}clipPath'):
        root.remove(cp)

    dropped = []
    for parent in root.iter():
        for child in list(parent):
            if child.tag != f'{Q}path':
                continue
            if is_exporter_bounding_box(child):
                parent.remove(child)
                dropped.append('bounding-box')
            elif is_redundant_outline(child):
                parent.remove(child)
                dropped.append('stroke-duplicate')

    for g in root.iter(f'{Q}g'):
        g.attrib.pop('clip-path', None)

    kept = list(root.iter(f'{Q}path'))
    if len(kept) != len(ids):
        raise SystemExit(
            f'{src}: expected {len(ids)} visible paths {ids}, found {len(kept)}. '
            'Refusing to guess which is which.'
        )
    for path, name in zip(kept, ids):
        path.set('id', name)

    # Normalise the origin to 0 0 by translating a wrapper group, rather than by
    # cropping to a viewBox with a non-zero min-x/min-y.
    #
    # **A non-zero origin is a trap, not a style preference.** Referencing the mark
    # through <use href="#symbol"> inside an <svg> that carries the same viewBox
    # applies the offset twice: the symbol's viewport starts at user-space (0,0),
    # which sits min-x left and min-y above the intended top-left, so the artwork
    # slides out of its own box and clips. A "0 0 W H" viewBox cannot do that,
    # whoever consumes it and however they nest it.
    #
    # The translate goes on a group so every path's `d` stays byte-identical to the
    # designer's export, which is the invariant this script exists to preserve.
    min_x, min_y, width, height = (float(v) for v in view_box.split())
    group = ET.Element(f'{Q}g', {'transform': f'translate({-min_x} {-min_y})'})
    for g in list(root):
        if g.tag == f'{Q}g':
            for child in list(g):
                g.remove(child)
                group.append(child)
            root.remove(g)
    root.append(group)
    root.set('viewBox', f'0 0 {width} {height}')
    # The exporter's inherited defaults. `fill="none"` on the root only ever
    # mattered for the stroke-duplicate that is now gone; every kept path names
    # its own fill.
    for attr in ('width', 'height', 'stroke', 'stroke-linecap',
                 'stroke-miterlimit', 'fill', 'version'):
        root.attrib.pop(attr, None)

    tree.write(dst, encoding='unicode', xml_declaration=False)
    fills = [f'{p.get("id")}={p.get("fill")}' for p in kept]
    print(f'{dst}\n    dropped: {", ".join(dropped)}\n    kept:    {", ".join(fills)}'
          f'\n    viewBox: "{view_box}"')


if __name__ == '__main__':
    base = sys.argv[1]
    # Bounds are the union of the VISIBLE paths only, from `inkscape --query-all`
    # run against the filled paths rather than the stroked duplicates.
    trim(f'{base}/SPENDIFICO_ICON.svg', f'{base}/SPENDIFICO_ICON.trimmed.svg',
         '14.0525 18.3478 99.4331 99.4331', ['box', 'glyph'])
    trim(f'{base}/SPENDIFICO_LOGO.svg', f'{base}/SPENDIFICO_LOGO.trimmed.svg',
         '21.5377 27.9134 604.2153 99.4331', ['wordmark', 'box', 'glyph'])
