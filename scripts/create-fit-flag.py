"""Create a branch flag from the outlined 01PLAYER logo (FIT by default).

The logo and main wordmark retain the supplied template paths. New branch
lettering is outlined before export, so both SVG and PDF remain font-independent.
Requires PyMuPDF and FontTools.
"""
import argparse
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

import pymupdf
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTCollection, TTFont

parser = argparse.ArgumentParser()
parser.add_argument('--template-pdf', type=Path)
parser.add_argument('--branch-name', default='福州理工分社')
parser.add_argument('--branch-code', default='FIT')
parser.add_argument('--pdf', type=Path, required=True)
parser.add_argument('--svg', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
flags = json.loads((root / 'src/data/branch-flags.json').read_text())
template = flags['fuzc' if args.template_pdf else 'fit']
_, _, width, height = map(float, template['viewBox'].split())
brand = template if 'brandPathCount' in template else next(flag for flag in flags.values() if 'brandPathCount' in flag)
paths = [dict(path) for path in brand['paths'][:brand['brandPathCount']]]
branch_box = pymupdf.Rect(0, 366, width, 388)
footer_box = pymupdf.Rect(0, 410, width, 426)
if args.template_pdf:
    with pymupdf.open(args.template_pdf) as source:
        if len(source) != 1 or abs(source[0].rect.width - width) > 1 or abs(source[0].rect.height - height) > 1:
            raise ValueError('Template PDF must contain one 300 × 200 mm page')


def union(rectangles):
    result = pymupdf.Rect(rectangles[0])
    for rectangle in rectangles[1:]:
        result |= rectangle
    return result

brand_path_count = len(paths)

def outline(text, font, size, tracking, center_y):
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / font['head'].unitsPerEm
    entries, bounds, cursor = [], [], 0
    for character in text:
        if ord(character) not in cmap:
            raise ValueError(f'Font does not contain {character!r}')
        name = cmap[ord(character)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        box_pen = BoundsPen(glyphs)
        glyphs[name].draw(box_pen)
        if box_pen.bounds:
            x0, y0, x1, y1 = box_pen.bounds
            bounds.append(pymupdf.Rect(cursor + x0 * scale, -y1 * scale, cursor + x1 * scale, -y0 * scale))
            entries.append((pen.getCommands(), cursor))
        cursor += font['hmtx'].metrics[name][0] * scale + tracking
    box = union(bounds)
    shift_x = width / 2 - (box.x0 + box.x1) / 2
    baseline = center_y - (box.y0 + box.y1) / 2
    for data, x in entries:
        paths.append({'d': data, 'fill': '#fafafa', 'transform': f'matrix({scale},0,0,{-scale},{x + shift_x},{baseline})'})
    return pymupdf.Rect(box.x0 + shift_x, box.y0 + baseline, box.x1 + shift_x, box.y1 + baseline)

cjk = TTCollection('/System/Library/Fonts/STHeiti Medium.ttc').fonts[1]
latin = TTFont('/System/Library/Fonts/Supplemental/Arial Bold.ttf')
outline(args.branch_name, cjk, 26, 6.5, (branch_box.y0 + branch_box.y1) / 2)
footer_y = (footer_box.y0 + footer_box.y1) / 2
footer = outline(f'01PLAYER · {args.branch_code} BRANCH', latin, 16, .8, footer_y)
for start, end in [(footer.x0 - 44, footer.x0 - 16), (footer.x1 + 16, footer.x1 + 44)]:
    paths.append({'d': f'M{start} {footer_y}H{end}', 'fill': 'none', 'stroke': '#fafafa', 'strokeWidth': '1.1'})

svg = ET.Element('svg', {'xmlns': 'http://www.w3.org/2000/svg', 'viewBox': template['viewBox'], 'width': str(width), 'height': str(height)})
ET.SubElement(svg, 'title').text = f'零一玩家｜{args.branch_name}旗帜'
for attributes in paths:
    ET.SubElement(svg, 'path', {re.sub(r'[A-Z]', lambda m: '-' + m[0].lower(), key): str(value) for key, value in attributes.items()})
args.svg.parent.mkdir(parents=True, exist_ok=True)
args.svg.write_bytes(ET.tostring(svg, encoding='utf-8', xml_declaration=True))

args.pdf.parent.mkdir(parents=True, exist_ok=True)
with pymupdf.open(stream=args.svg.read_bytes(), filetype='svg') as vector:
    data = vector.convert_to_pdf()
with pymupdf.open(stream=data, filetype='pdf') as document:
    page = document[0]
    assert abs(page.rect.width - width) < .01 and abs(page.rect.height - height) < .01
    document.set_metadata({'title': f'零一玩家｜{args.branch_name}旗帜', 'author': '零一玩家'})
    document.save(args.pdf, garbage=4, deflate=True)
print(f'Created PDF/SVG with {len(paths)} vector paths')
