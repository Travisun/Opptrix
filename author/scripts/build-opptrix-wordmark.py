#!/usr/bin/env python3
"""Opptrix + 工作台 — boolean-merged constructed path wordmark."""

from __future__ import annotations

import math
from pathlib import Path

import pathops
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
OUT_LIGHT = ROOT / "opptrix-wordmark-path.svg"
OUT_DARK = ROOT / "opptrix-wordmark-path-dark.svg"
OUT_LIGHT_GUIDES = ROOT / "opptrix-wordmark-path-guides.svg"

INK = "#141414"
ON_DARK = "#F0F0F0"
CANVAS = "#FCFCFC"
CANVAS_DARK = "#181818"
BASE_C = "#EF4444"
CAP_C = "#10B981"
XH_C = "#3B82F6"

PAD = 48.0
H = 160.0
BASE = PAD + H
TOP = PAD
XH = H * 0.70
DESC = H * 0.30
STEM = H * 0.138
STROKE_X = H * 0.122
GAP_LATIN = H * 0.055
GAP_PP = H * 0.04
GAP_CJK = H * 0.28
TRACK_CJK = H * 0.075


def to_svg(p: pathops.Path) -> str:
    pen = SVGPathPen(None)
    p.draw(pen)
    return pen.getCommands()


def _prepare(p: pathops.Path) -> pathops.Path:
    """Boolean ops reject CONIC verbs from arcTo — convert in place."""
    p.convertConicsToQuads(0.2)
    return p


def union_paths(*paths: pathops.Path) -> pathops.Path:
    ob = pathops.OpBuilder()
    for p in paths:
        ob.add(_prepare(p), pathops.PathOp.UNION)
    return ob.resolve()


def diff_paths(subject: pathops.Path, clip: pathops.Path) -> pathops.Path:
    ob = pathops.OpBuilder()
    ob.add(_prepare(subject), pathops.PathOp.UNION)
    ob.add(_prepare(clip), pathops.PathOp.DIFFERENCE)
    return ob.resolve()


def _cubic_circle(cx: float, cy: float, r: float) -> pathops.Path:
    """Unit circle approx with 4 cubics (kappa)."""
    k = 0.5522847498307936 * r
    p = pathops.Path()
    p.moveTo(cx + r, cy)
    p.cubicTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r)
    p.cubicTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
    p.cubicTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r)
    p.cubicTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy)
    p.close()
    return p


def rounded_rect(x: float, y: float, w: float, h: float, r: float) -> pathops.Path:
    r = min(r, w / 2, h / 2)
    k = 0.5522847498307936 * r
    p = pathops.Path()
    p.moveTo(x + r, y)
    p.lineTo(x + w - r, y)
    p.cubicTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r)
    p.lineTo(x + w, y + h - r)
    p.cubicTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)
    p.lineTo(x + r, y + h)
    p.cubicTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r)
    p.lineTo(x, y + r)
    p.cubicTo(x, y + r - k, x + r - k, y, x + r, y)
    p.close()
    return p


def stadium_h(x: float, y: float, w: float, h: float) -> pathops.Path:
    r = h / 2.0
    # Caps as half-circles via cubic circle pieces + body
    # Simpler: rounded rect with r = h/2 using cubics
    return rounded_rect(x, y, w, h, r)


def stadium_v(x: float, y: float, w: float, h: float) -> pathops.Path:
    return rounded_rect(x, y, w, h, w / 2.0)


def circle(cx: float, cy: float, r: float) -> pathops.Path:
    return _cubic_circle(cx, cy, r)


def rotated_stadium(cx: float, cy: float, length: float, thick: float, deg: float) -> pathops.Path:
    local = stadium_h(-length / 2, -thick / 2, length, thick)
    rad = math.radians(deg)
    c, s = math.cos(rad), math.sin(rad)
    # SVG affine [a b c d e f] = [cos sin -sin cos tx ty]
    return local.transform(c, s, -s, c, cx, cy)


def ring(cx: float, cy: float, r_out: float, r_in: float) -> pathops.Path:
    return diff_paths(circle(cx, cy, r_out), circle(cx, cy, r_in))


def glyph_O(x0: float) -> tuple[str, float]:
    r_out = H / 2
    stroke = STEM * 1.05
    cx = x0 + r_out
    cy = TOP + H / 2
    return to_svg(ring(cx, cy, r_out, r_out - stroke)), x0 + 2 * r_out


def glyph_p(x0: float) -> tuple[str, float]:
    bowl_r = XH * 0.50
    stroke = STEM * 0.98
    stem_top = BASE - XH - STEM * 0.10
    stem_bot = BASE + DESC
    stem = stadium_v(x0, stem_top, STEM, stem_bot - stem_top)
    cx = x0 + STEM * 0.55 + bowl_r * 0.92
    cy = BASE - bowl_r
    bowl = ring(cx, cy, bowl_r, bowl_r - stroke)
    width = (cx + bowl_r) - x0 + STEM * 0.08
    return to_svg(union_paths(stem, bowl)), x0 + width


def glyph_t(x0: float) -> tuple[str, float]:
    """Lowercase t: ascender stub above crossbar (not a full-cap T)."""
    stem_x = x0 + STEM * 0.7
    stem_top = TOP + H * 0.22
    stem = stadium_v(stem_x, stem_top, STEM, BASE - stem_top)
    bar_h = STEM * 0.92
    bar_y = TOP + H * 0.34
    bar_w = STEM * 3.2
    bar = stadium_h(x0, bar_y, bar_w, bar_h)
    return to_svg(union_paths(stem, bar)), x0 + bar_w


def glyph_r(x0: float) -> tuple[str, float]:
    stem_top = BASE - XH
    stem = stadium_v(x0, stem_top, STEM, XH)
    ear_y = stem_top + STEM * 0.05
    # Soft shoulder: horizontal stub + short descending ear (Surgena-like)
    ear = stadium_h(x0 + STEM * 0.4, ear_y, STEM * 1.55, STEM * 0.9)
    shoulder = rotated_stadium(x0 + STEM * 2.15, ear_y + STEM * 0.85, STEM * 1.55, STEM * 0.88, 38)
    return to_svg(union_paths(stem, ear, shoulder)), x0 + STEM * 3.15


def glyph_i(x0: float) -> tuple[str, float]:
    stem = stadium_v(x0, BASE - XH, STEM, XH)
    tr = STEM * 0.50
    tittle = circle(x0 + STEM / 2, TOP + H * 0.12 + tr, tr)
    return to_svg(union_paths(stem, tittle)), x0 + STEM


def glyph_x(x0: float) -> tuple[str, float]:
    """Signature x: thicker NW–SE stroke + thinner cross + center node."""
    size = XH * 1.10
    cx = x0 + size / 2
    cy = BASE - XH / 2
    primary = rotated_stadium(cx, cy, size * 1.30, STROKE_X * 1.18, 40)
    secondary = rotated_stadium(cx, cy, size * 1.18, STROKE_X * 0.82, -48)
    node = circle(cx, cy, STROKE_X * 0.48)
    return to_svg(union_paths(primary, secondary, node)), x0 + size


def glyph_gong(x0: float) -> tuple[str, float]:
    w = H * 0.90
    bar_h = STEM * 1.02
    top = stadium_h(x0, TOP + H * 0.04, w, bar_h)
    bot = stadium_h(x0, BASE - bar_h - H * 0.04, w, bar_h)
    vx = x0 + (w - STEM) / 2
    vert = stadium_v(vx, TOP + H * 0.04, STEM, H - H * 0.08)
    return to_svg(union_paths(top, bot, vert)), x0 + w


def glyph_zuo(x0: float) -> tuple[str, float]:
    """作 as logo Heiti: 亻 + 乍 structure, readable at wordmark scale."""
    # 亻
    person = stadium_v(x0 + STEM * 0.2, TOP + H * 0.06, STEM, H * 0.88)
    person_arm = rotated_stadium(x0 + STEM * 0.95, TOP + H * 0.22, STEM * 1.7, STEM * 0.9, -38)
    # 乍
    rx = x0 + STEM * 2.5
    rw = H * 0.50
    top = stadium_h(rx, TOP + H * 0.08, rw, STEM * 0.92)
    # short left-falling stroke under top
    fall = rotated_stadium(rx + rw * 0.28, TOP + H * 0.28, H * 0.28, STEM * 0.88, -50)
    mid = stadium_h(rx, TOP + H * 0.36, rw * 0.95, STEM * 0.88)
    vert = stadium_v(rx + rw * 0.42, TOP + H * 0.36, STEM, H * 0.50)
    foot = stadium_h(rx + rw * 0.08, BASE - STEM * 1.05, rw * 0.78, STEM * 0.92)
    return to_svg(union_paths(person, person_arm, top, fall, mid, vert, foot)), x0 + STEM * 2.5 + rw


def glyph_tai(x0: float) -> tuple[str, float]:
    """台: upper open triangle from three bars + lower rounded 口."""
    w = H * 0.90
    apex_x = x0 + w * 0.50
    apex_y = TOP + H * 0.12
    left_x = x0 + w * 0.20
    right_x = x0 + w * 0.80
    base_y = TOP + H * 0.40
    # three stadium bars along triangle edges (open 厶, not a solid fill)
    def edge(x1: float, y1: float, x2: float, y2: float) -> pathops.Path:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        length = math.hypot(x2 - x1, y2 - y1) + STEM * 0.15
        ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
        return rotated_stadium(mx, my, length, STEM * 0.95, ang)

    upper = union_paths(
        edge(apex_x, apex_y, right_x, base_y),
        edge(apex_x, apex_y, left_x, base_y),
        edge(left_x, base_y, right_x, base_y),
    )

    box_x = x0 + w * 0.14
    box_y = TOP + H * 0.48
    box_w = w * 0.72
    box_h = H * 0.42
    outer = rounded_rect(box_x, box_y, box_w, box_h, STEM * 0.42)
    inn = STEM * 0.95
    inner = rounded_rect(box_x + inn, box_y + inn, box_w - 2 * inn, box_h - 2 * inn, STEM * 0.32)
    mouth = diff_paths(outer, inner)
    return to_svg(union_paths(upper, mouth)), x0 + w


def build(fill: str, canvas: str, guides: bool = True) -> str:
    glyphs: list[tuple[str, str]] = []
    x = PAD

    d, x = glyph_O(x)
    glyphs.append(("latin/O", d))
    x += GAP_LATIN * 0.75

    for i in range(2):
        d, x = glyph_p(x)
        glyphs.append((f"latin/p{i + 1}", d))
        x += GAP_PP

    x += GAP_LATIN * 0.3
    d, x = glyph_t(x)
    glyphs.append(("latin/t", d))
    x += GAP_LATIN * 0.55

    d, x = glyph_r(x)
    glyphs.append(("latin/r", d))
    x += GAP_LATIN * 0.7

    d, x = glyph_i(x)
    glyphs.append(("latin/i", d))
    x += GAP_LATIN * 0.95

    d, x = glyph_x(x)
    glyphs.append(("latin/x", d))

    x += GAP_CJK
    d, x = glyph_gong(x)
    glyphs.append(("cjk/工", d))
    x += TRACK_CJK

    d, x = glyph_zuo(x)
    glyphs.append(("cjk/作", d))
    x += TRACK_CJK

    d, x = glyph_tai(x)
    glyphs.append(("cjk/台", d))

    width = x + PAD
    height = BASE + DESC + PAD * 0.5

    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.1f}" height="{height:.1f}" '
        f'viewBox="0 0 {width:.1f} {height:.1f}" fill="none">',
        f'<rect width="100%" height="100%" fill="{canvas}"/>',
        "<!-- Opptrix path wordmark: boolean-merged geometric Latin + constructed 工作台 -->",
        f'<g id="wordmark" fill="{fill}">',
    ]
    for name, d in glyphs:
        lines.append(f'<path id="{name}" d="{d}" fill="{fill}" fill-rule="nonzero"/>')
    lines.append("</g>")
    if guides:
        right = width - PAD
        lines += [
            f'<line x1="{PAD}" y1="{BASE}" x2="{right}" y2="{BASE}" stroke="{BASE_C}" stroke-width="0.75" opacity="0.45"/>',
            f'<line x1="{PAD}" y1="{TOP}" x2="{right}" y2="{TOP}" stroke="{CAP_C}" stroke-width="0.75" opacity="0.45"/>',
            f'<line x1="{PAD}" y1="{BASE - XH}" x2="{right}" y2="{BASE - XH}" stroke="{XH_C}" stroke-width="0.6" opacity="0.35"/>',
        ]
    lines.append("</svg>")
    return "\n".join(lines)


def main() -> None:
    OUT_LIGHT.write_text(build(INK, CANVAS, False), encoding="utf-8")
    OUT_DARK.write_text(build(ON_DARK, CANVAS_DARK, False), encoding="utf-8")
    OUT_LIGHT_GUIDES.write_text(build(INK, CANVAS, True), encoding="utf-8")
    print("wrote", OUT_LIGHT)
    print("wrote", OUT_DARK)
    print("wrote", OUT_LIGHT_GUIDES)


if __name__ == "__main__":
    main()
