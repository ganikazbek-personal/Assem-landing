"""
Pull a clean floor plan out of a project PDF as a small SVG for the scroll story.

    python3 -m venv .venv && .venv/bin/pip install pymupdf
    .venv/bin/python scripts/plan-from-pdf.py <project.pdf> <page> <x0,y0,x1,y1> <out.svg>

<page> is 1-based; the crop box is in PDF points of the page as it is displayed
(rotation applied). Keeps walls, windows, doors and furniture; drops the floor
pattern, heated-floor mats, blue/red annotations, dimension lines and all text.
Colours become classes (pl-wall, pl-ink, pl-line, pl-mask, pl-soft) so CSS
decides how the drawing looks; line paths get pathLength="1" so they can be
"drawn" with stroke-dashoffset.
"""
import re
import sys

import pymupdf

pdf, page_no, crop, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
X0, Y0, X1, Y1 = (float(v) for v in crop.split(','))

DROP_STROKE = {'#dad3cc', '#e0dad4', '#bb8888', '#e6b3b3', '#0000ff', '#ff0000'}   # floor pattern, heated floor, notes
DROP_FILL = {'#fbc7c7', '#ffcccc', '#0000ff', '#ff0000', '#000000', '#f2efee', '#f2efed', '#f2f0ed'}
GHOST_FILL = {'#fbc7c7', '#ffcccc', '#000000', '#ff0000', '#0000ff'}   # dropped shapes whose black outlines must go too
WALL_FILL = {'#aaaaaa', '#c0c0c0', '#c3c3c3', '#808080'}

svg_src = pymupdf.open(pdf)[page_no - 1].get_svg_image(text_as_path=False)

# Every path in PyMuPDF's export carries the same page transform; bake it into the coordinates
tf = re.search(r'<path transform="matrix\(([^)]*)\)"', svg_src).group(1)
A, B, C, D, E, F = (float(v) for v in re.split(r'[ ,]+', tf.strip()))
num = r'-?\d*\.?\d+(?:e-?\d+)?'
tok_re = re.compile(rf'[MLCHVZ]|{num}')


def bake(d):
    toks = tok_re.findall(d)
    i, cmd, cx, cy, sx, sy = 0, None, 0.0, 0.0, 0.0, 0.0
    parts, xs, ys = [], [], []

    def pt(x, y):
        X, Y = A * x + C * y + E, B * x + D * y + F
        xs.append(X); ys.append(Y)
        return f'{X:.1f} {Y:.1f}'

    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t; i += 1
            if cmd == 'Z':
                parts.append('Z'); cx, cy = sx, sy
            continue
        if cmd == 'M':
            cx, cy = float(toks[i]), float(toks[i + 1]); i += 2
            parts.append('M' + pt(cx, cy)); sx, sy = cx, cy; cmd = 'L'
        elif cmd == 'L':
            cx, cy = float(toks[i]), float(toks[i + 1]); i += 2
            parts.append('L' + pt(cx, cy))
        elif cmd == 'H':
            cx = float(toks[i]); i += 1; parts.append('L' + pt(cx, cy))
        elif cmd == 'V':
            cy = float(toks[i]); i += 1; parts.append('L' + pt(cx, cy))
        elif cmd == 'C':
            c = [float(v) for v in toks[i:i + 6]]; i += 6
            parts.append('C' + ' '.join(pt(c[k], c[k + 1]) for k in (0, 2, 4))); cx, cy = c[4], c[5]
        else:
            raise ValueError(f'unhandled path command {cmd}')
    return ''.join(parts), (min(xs), min(ys), max(xs), max(ys))


def attr(line, name):
    m = re.search(rf' {name}="([^"]*)"', line)
    return m.group(1) if m else None


def is_tick(d, bb):
    # Dimension ticks: one short 45-degree stroke
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    return d.count('M') == 1 and d.count('L') == 1 and 0.8 < w < 4 and 0.8 < h < 4 and abs(w - h) < 0.6


lines = [l.strip() for l in svg_src.split('\n')]
ghosts = [bake(attr(l, 'd'))[1] for l in lines if l.startswith('<path') and attr(l, 'fill') in GHOST_FILL]
near = lambda a, b, tol: all(abs(a[k] - b[k]) <= tol for k in range(4))
inside = lambda a, b, pad: a[0] >= b[0] - pad and a[1] >= b[1] - pad and a[2] <= b[2] + pad and a[3] <= b[3] + pad

body, defs, in_defs = [], [], False
for s in lines:
    if s.startswith('<defs'): in_defs = True; continue
    if s.startswith('</defs'): in_defs = False; continue
    if in_defs:
        if s.startswith('<clipPath'): defs.append(f'<clipPath id="pl-{attr(s, "id")}">')
        elif s.startswith('</clipPath'): defs.append('</clipPath>')
        elif s.startswith('<path'):
            rule = attr(s, 'clip-rule')
            defs.append(f'<path d="{bake(attr(s, "d"))[0]}"' + (f' clip-rule="{rule}"' if rule else '') + '/>')
        continue
    if s.startswith('<g clip-path'): body.append(('g', s.replace('url(#', 'url(#pl-'))); continue
    if s.startswith('</g>'): body.append(('/g',)); continue
    if not s.startswith('<path'): continue                       # text and the svg wrapper
    stroke, fill, sw = attr(s, 'stroke'), attr(s, 'fill'), attr(s, 'stroke-width')
    if stroke in DROP_STROKE or fill in DROP_FILL or sw == '5' or (stroke == '#000000' and sw == '1'):
        continue
    d, bb = bake(attr(s, 'd'))
    if bb[2] < X0 or bb[0] > X1 or bb[3] < Y0 or bb[1] > Y1:
        continue
    if stroke == '#000000' and (is_tick(d, bb) or any(near(bb, g, 1) or inside(bb, g, 4) for g in ghosts)):
        continue
    if fill and fill != 'none':
        cls = 'pl-wall' if fill in WALL_FILL else 'pl-mask' if fill == '#ffffff' else 'pl-soft'
        if stroke and stroke != 'none': cls += ' pl-edge'
    else:
        cls = 'pl-ink' if stroke == '#000000' else 'pl-line'
    body.append(('p', cls, d))

# Merge runs of one class, drop clip groups that ended up empty
merged, cur = [], None
for item in body:
    if item[0] == 'p':
        if cur and cur[1] == item[1]: cur[2].append(item[2])
        else: cur = ['p', item[1], [item[2]]]; merged.append(cur)
    else:
        cur = None; merged.append(item)

out_lines, stack = [], []
for item in merged:
    if item[0] == 'g':
        stack.append(len(out_lines)); out_lines.append(item[1])
    elif item[0] == '/g':
        start = stack.pop()
        if start == len(out_lines) - 1: out_lines.pop()
        else: out_lines.append('</g>')
    else:
        drawable = ' pathLength="1"' if item[1] in ('pl-ink', 'pl-line') else ''
        out_lines.append(f'<path class="{item[1]}"{drawable} d="{"".join(item[2])}"/>')

used = set(re.findall(r'url\(#(pl-clip_\d+)\)', '\n'.join(out_lines)))
defs_out, keep = [], False
for l in defs:
    if l.startswith('<clipPath'): keep = re.search(r'id="([^"]+)"', l).group(1) in used
    if keep: defs_out.append(l)

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{X0:g} {Y0:g} {X1 - X0:g} {Y1 - Y0:g}">\n'
       f'<defs>{"".join(defs_out)}</defs>\n' + '\n'.join(out_lines) + '\n</svg>\n')
open(out, 'w', encoding='utf-8').write(svg)
print(f'{out}: {len(out_lines)} elements, {len(svg) // 1024} KB')
