#!/usr/bin/env python3
"""
Smaller copies of every project photo, so grids and cards don't download the
full 1600px originals. Run before scripts/build-projects.mjs, which picks the
copies up into srcset:

    python3 scripts/make-variants.py

For projects/<slug>/NN.jpg it writes
    projects/<slug>/w480/NN.<fmt>   grid on phones, cards, avatars
    projects/<slug>/w960/NN.<fmt>   grid on desktop, retina phones
    projects/<slug>/w480/NN.jpg     for places with no format fallback (SVG <image>, CSS blur)
    projects/<slug>/w24/NN.jpg      a ~0.5 KB blurry preview, inlined as the placeholder
where <fmt> is avif, or webp for projects whose AVIFs don't decode in Chrome (chic).
It also writes the full-size projects/<slug>/NN.avif when it's missing (quality 52: the
cover, the lightbox and the next-project cover use it). `--recompress` re-encodes the
existing full-size AVIFs from their JPEGs at that quality.
Existing copies newer than their source are skipped, so re-runs are cheap.
Needs Pillow with AVIF support (Pillow >= 11).
"""
import os
import sys
from PIL import Image, ImageOps, features

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTHS = (480, 960)
WEBP_ONLY = {'chic'}
QUALITY = {'avif': {480: 52, 960: 58, 0: 52}, 'webp': {480: 74, 960: 78}, 'jpg': {480: 78, 24: 45}}
RECOMPRESS = '--recompress' in sys.argv

if not features.check('avif'):
    sys.exit('Pillow was built without AVIF support')


def fresh(dst, src):
    return os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src)


def save(im, dst, fmt, width):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    q = QUALITY[fmt][width]
    if fmt == 'avif':
        im.save(dst, quality=q, speed=6)
    elif fmt == 'webp':
        im.save(dst, quality=q, method=6)
    else:
        im.save(dst, quality=q, optimize=True, progressive=width > 100)


made = skipped = 0
projects = os.path.join(ROOT, 'projects')
for slug in sorted(os.listdir(projects)):
    folder = os.path.join(projects, slug)
    if not os.path.isdir(folder):
        continue
    fmt = 'webp' if slug in WEBP_ONLY else 'avif'
    for name in sorted(os.listdir(folder)):
        if not (name.endswith('.jpg') and name[:-4].isdigit()):
            continue
        src = os.path.join(folder, name)
        stem = name[:-4]
        jobs = [(w, fmt) for w in WIDTHS] + [(480, 'jpg'), (24, 'jpg')]
        jobs = [(w, f, os.path.join(folder, f'w{w}', f'{stem}.{f}')) for w, f in jobs]
        todo = [j for j in jobs if not fresh(j[2], src)]
        full = os.path.join(folder, f'{stem}.avif')                 # width 0 = full size
        if fmt == 'avif' and (RECOMPRESS or not os.path.exists(full)):
            todo.append((0, 'avif', full))
        if not todo:
            skipped += len(jobs)
            continue
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
        for w, f, dst in todo:
            if w and im.width <= w:
                continue
            small = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS) if w else im
            save(small, dst, f, w)
            made += 1

# Stories pictures (projects/<slug>/stories/NN.jpg) only need the blurry preview
for folder in sorted(os.path.join(projects, s, 'stories') for s in os.listdir(projects)):
    if not os.path.isdir(folder):
        continue
    for name in sorted(os.listdir(folder)):
        if not (name.endswith('.jpg') and name[:-4].isdigit()):
            continue
        src = os.path.join(folder, name)
        dst = os.path.join(folder, 'w24', name)
        if fresh(dst, src):
            skipped += 1
            continue
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
        save(im.resize((24, round(im.height * 24 / im.width)), Image.LANCZOS), dst, 'jpg', 24)
        made += 1

print(f'{made} copies written, {skipped} up to date')
