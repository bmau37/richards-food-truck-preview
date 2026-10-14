"""Rebuild optimized images from the source package (Pillow >= 10).
Run from site/:  python3 tools/optimize_images.py <source_assets_dir> <pdf_images_dir>
Resizes only (no crops that change portions, no retouching). Strips metadata."""
import sys, os, json
from PIL import Image, ImageOps
SRC, PDF = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'img')
# name: (source path, kind, widths)
jobs = {
 'truck':      (f'{SRC}/hero.jpg',     'original-photo', [480, 640, 1100]),
 'trailer':    (f'{SRC}/logo.jpg',     'original-photo (supplied logo reference)', [480, 640, 1100]),
 'burger':     (f'{SRC}/burger.jpg',   'original-photo', [480, 675]),
 'biscuits':   (f'{SRC}/biscuit.jpg',  'original-photo', [480, 900]),
 'rye':        (f'{SRC}/sandwich.jpg', 'original-photo', [480, 900]),
 'open-egg':   (f'{SRC}/before8.jpg',  'original-photo', [480, 900]),
 'croissant':  (f'{PDF}/i-000.png',    'original-photo (ACTUAL ORIGINAL, concept PDF p1)', [480, 937]),
 'croissant-pair': (f'{PDF}/i-004.png','original-photo (ACTUAL ORIGINAL, concept PDF p2)', [480, 937]),
 'pulled':     (f'{PDF}/i-008.png',    'original-photo (ACTUAL ORIGINAL, concept PDF p3)', [480, 709]),
 'blackbean':  (f'{PDF}/i-012.png',    'original-photo (ACTUAL ORIGINAL, concept PDF p4)', [480, 709]),
 'cut-egg':    (f'{PDF}/i-020.png',    'original-photo (ACTUAL ORIGINAL, concept PDF p6)', [480, 937]),
 'concept-evening': (f'{SRC}/scene2.jpg', 'AI ILLUSTRATED CONCEPT - not an event photo', [640, 1000]),
 'concept-table':   (f'{SRC}/scene3.jpg', 'AI ILLUSTRATED CONCEPT - not an event photo', [640, 1000]),
 'concept-kitchen': (f'{SRC}/scene4.jpg', 'AI ILLUSTRATED CONCEPT - not an event photo', [640, 1000]),
}
manifest = []
for name, (path, kind, widths) in jobs.items():
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    for w in widths:
        w = min(w, im.width); h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS)
        for ext, kw in (('webp', dict(quality=80, method=6)), ('jpg', dict(quality=80, optimize=True, progressive=True))):
            fn = f'{name}-{w}.{ext}'; r.save(os.path.join(OUT, fn), **kw)
            manifest.append(dict(file=f'assets/img/{fn}', source=os.path.basename(path), kind=kind, width=w, height=h, bytes=os.path.getsize(os.path.join(OUT, fn))))
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print(len(manifest), 'files')
