"""Render the current black-and-white club flags from the approved logo SVGs."""

import argparse
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
WIDTH, HEIGHT = 900, 600
CHINESE_FONT = Path("/System/Library/Fonts/Hiragino Sans GB.ttc")

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--font", type=Path, default=CHINESE_FONT)
parser.add_argument("--output", type=Path, default=ROOT / "public/images/branches/flags")
args = parser.parse_args()

# Hiragino Sans GB W6 is the third face in the macOS collection.
font_index = 2 if args.font.name == CHINESE_FONT.name else 1
font = TTFont(args.font, fontNumber=font_index if args.font.suffix.lower() == ".ttc" else -1)
latin_font = TTFont(ROOT / "scripts/fonts/Orbitron.ttf")
units_per_em = font["head"].unitsPerEm


def coordinate(value):
    return f"{value:.4f}".rstrip("0").rstrip(".")


def add(parent, tag, **attributes):
    return ET.SubElement(parent, f"{{{SVG}}}{tag}", attributes)


def measure(text, face, tracking=.065, location=None):
    glyphs = face.getGlyphSet(location=location)
    characters = face.getBestCmap()
    letter_gap = face["head"].unitsPerEm * tracking
    paths, boxes = [], []
    cursor = 0
    for character in text:
        glyph = glyphs[characters[ord(character)]]
        outline = SVGPathPen(glyphs)
        bounds = BoundsPen(glyphs)
        glyph.draw(outline)
        glyph.draw(bounds)
        if bounds.bounds:
            x0, y0, x1, y1 = bounds.bounds
            boxes.append((cursor + x0, y0, cursor + x1, y1))
            paths.append((cursor, outline.getCommands()))
        cursor += glyph.width + letter_gap
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    return paths, box


def lettering(parent, outline, center_y, scale):
    paths, (x0, y0, x1, y1) = outline
    x = WIDTH / 2 - (x0 + x1) / 2 * scale
    y = center_y + (y0 + y1) / 2 * scale
    group = add(parent, "g", fill="#fff", transform=f"translate({coordinate(x)} {coordinate(y)}) scale({coordinate(scale)} {coordinate(-scale)})")
    for cursor, data in paths:
        add(group, "path", d=data, transform=f"translate({coordinate(cursor)} 0)")


def place_logo(parent, filename, x, y, scale):
    source = ET.parse(ROOT / "public/images" / filename).getroot()
    group = add(parent, "g", transform=f"translate({coordinate(x)} {coordinate(y)}) scale({coordinate(scale)})")
    for child in source:
        if child.tag != f"{{{SVG}}}title":
            group.append(deepcopy(child))


data = subprocess.check_output(
    ["node", "--input-type=module", "-e",
     "import { branches } from './src/data/branches.js'; "
     "import { COMMUNITY_SLOGAN, COMMUNITY_SLOGAN_EN } from './src/data/positioning.js'; "
     "console.log(JSON.stringify({ branches, slogan: COMMUNITY_SLOGAN, sloganEn: COMMUNITY_SLOGAN_EN }));"],
    cwd=ROOT,
    text=True,
)
config = json.loads(data)
slogan = measure(config["slogan"], font)
slogan_en = measure(config["sloganEn"].upper(), latin_font, tracking=.045, location={"wght": 900})
english_width = slogan_en[1][2] - slogan_en[1][0]
english_scale = min(22 / latin_font["head"].unitsPerEm, 480 / english_width)
args.output.mkdir(parents=True, exist_ok=True)

for branch in config["branches"]:
    title = "总社" if branch["role"] == "总社" else branch["name"]
    flag = ET.Element(f"{{{SVG}}}svg", {"viewBox": "0 0 900 600", "width": "300mm", "height": "200mm"})
    add(flag, "title").text = f"零一玩家｜{title}旗帜"
    add(flag, "desc").text = f'{config["slogan"]} {config["sloganEn"]}'
    add(flag, "rect", width=str(WIDTH), height=str(HEIGHT), fill="#000")
    headquarters = branch["role"] == "总社"
    content_offset_y = 0 if headquarters else 12
    # Use the approved bilingual lockup unchanged on every flag.
    logo_width = 690 if headquarters else 630
    logo_y = (236 if headquarters else 194) + content_offset_y
    scale = logo_width / 1602
    place_logo(flag, "club-logo-horizontal-white.svg", (WIDTH - logo_width) / 2, logo_y - 280 * scale, scale)
    if not headquarters:
        name = measure(title, font)
        name_width = name[1][2] - name[1][0]
        lettering(flag, name, 335 + content_offset_y, min(52 / units_per_em, 585 / name_width))
    slogan_y = (383 if headquarters else 403) + content_offset_y
    lettering(flag, slogan, slogan_y, (39 if headquarters else 32) / units_per_em)
    lettering(flag, slogan_en, slogan_y + 43, english_scale)
    ET.indent(flag)
    (args.output / f'{branch["id"]}.svg').write_bytes(ET.tostring(flag, encoding="utf-8", xml_declaration=True))

print(f'Generated {len(config["branches"])} outlined flag SVGs.')
