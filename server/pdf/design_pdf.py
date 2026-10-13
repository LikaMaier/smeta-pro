#!/usr/bin/env python3
"""
PDF «Эскизный проект» ИИ-проектировщика: 3D-виды, план, фасады, разрез основания,
спецификация металла с раскроем, ведомость материалов и стоимость.
Вход — JSON (stdin) с готовыми примитивами из shared/design/render.ts, выход — PDF (stdout).
"""
import io
import json
import os
import sys
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_CENTER

sys.path.insert(0, os.path.dirname(__file__))
from estimate_pdf import money, qty, esc, image  # noqa: E402  шрифты DejaVu регистрируются там

PW, PH = landscape(A4)

# ---------------------------------------------------------------- шрифты: PT Sans (ПараТайп, OFL) + DejaVu для редких знаков
from reportlab.pdfbase import pdfmetrics  # noqa: E402
from reportlab.pdfbase.ttfonts import TTFont  # noqa: E402
from reportlab.pdfbase.pdfmetrics import registerFontFamily  # noqa: E402

FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")
try:
    pdfmetrics.registerFont(TTFont("PT", os.path.join(FONT_DIR, "PT_Sans-Web-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("PT-B", os.path.join(FONT_DIR, "PT_Sans-Web-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("PT-I", os.path.join(FONT_DIR, "PT_Sans-Web-Italic.ttf")))
    pdfmetrics.registerFont(TTFont("PTN", os.path.join(FONT_DIR, "PT_Sans-Narrow-Web-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("PTN-B", os.path.join(FONT_DIR, "PT_Sans-Narrow-Web-Bold.ttf")))
    registerFontFamily("PT", normal="PT", bold="PT-B", italic="PT-I", boldItalic="PT-B")
    registerFontFamily("PTN", normal="PTN", bold="PTN-B", italic="PTN", boldItalic="PTN-B")
    F, FB, FN, FNB = "PT", "PT-B", "PTN", "PTN-B"
except Exception:  # шрифтов нет — DejaVu
    F, FB, FN, FNB = "DV", "DV-B", "DV", "DV-B"

_GLYPHS = {}
def has_glyph(font, ch):
    key = (font, ch)
    if key not in _GLYPHS:
        try:
            _GLYPHS[key] = ord(ch) in pdfmetrics.getFont(font).face.charToGlyph
        except Exception:
            _GLYPHS[key] = True
    return _GLYPHS[key]

def runs(s, font):
    """Разбить строку на куски: символы, которых нет в шрифте (▲ → ✓), — DejaVu."""
    out, cur, cur_f = [], "", None
    for ch in s:
        f = font if has_glyph(font, ch) else ("DV-B" if font.endswith("-B") else "DV")
        if f != cur_f and cur:
            out.append((cur, cur_f)); cur = ""
        cur += ch; cur_f = f
    if cur:
        out.append((cur, cur_f))
    return out

def text_width(s, font, size):
    return sum(pdfmetrics.stringWidth(t, f, size) for t, f in runs(s, font))

def draw_text(c, x, y, s, font, size, align="left"):
    s = str(s)
    w = text_width(s, font, size)
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    for t, f in runs(s, font):
        c.setFont(f, size); c.drawString(x0, y, t); x0 += pdfmetrics.stringWidth(t, f, size)

def para_text(s):
    """Для Paragraph: экранировать и обернуть отсутствующие в шрифте знаки в DejaVu."""
    return "".join(t if f.startswith("PT") or f == F else f'<font name="{f}">{t}</font>' for t, f in runs(esc(s), F))

# ---------------------------------------------------------------- рамка по мотивам ГОСТ 2.301 / 2.104
FL, FR, FBm, FT = 20 * mm, PW - 5 * mm, 5 * mm, PH - 5 * mm   # внутренняя рамка
CL, CR = FL + 5 * mm, FR - 5 * mm                             # поле содержимого
CT = FT - 15 * mm                                             # под заголовком листа
STAMP_W = 185 * mm
CB1 = FBm + 40 * mm + 4 * mm                                  # низ содержимого на 1-м листе (штамп 40 мм)
CB = FBm + 15 * mm + 4 * mm                                   # на остальных (штамп 15 мм)
M = CL                                                        # совместимость

INK = colors.HexColor("#1E1E1E")
BLUE = colors.HexColor("#1f5fae")
MUT = colors.HexColor("#5F6670")
LINE = colors.HexColor("#1E1E1E")
HEAD_BG = colors.HexColor("#E9EDF2")
ZEBRA = colors.HexColor("#F7F8FA")
ST = {
    "t": ParagraphStyle("t", fontName=FN, fontSize=8.5, leading=10.5, textColor=INK),
    "tb": ParagraphStyle("tb", fontName=FNB, fontSize=8.5, leading=10.5, textColor=INK),
    "tr": ParagraphStyle("tr", fontName=FN, fontSize=8.5, leading=10.5, textColor=INK, alignment=TA_RIGHT),
    "tc": ParagraphStyle("tc", fontName=FN, fontSize=8.5, leading=10.5, textColor=INK, alignment=TA_CENTER),
    "h": ParagraphStyle("h", fontName=FNB, fontSize=8.5, leading=10.5, textColor=INK, alignment=TA_CENTER),
}


def hexc(s, default="#333333"):
    try:
        return colors.HexColor(s)
    except Exception:
        return colors.HexColor(default)


# ---------------------------------------------------------------- 3D
def draw_view3d(c, v, x, y, w, h, bg=None):
    k = min(w / v["w"], h / v["h"])
    ox = x + (w - v["w"] * k) / 2
    oy = y + (h - v["h"] * k) / 2
    if bg:
        c.setFillColor(hexc(bg)); c.rect(x, y, w, h, stroke=0, fill=1)
    P = lambda p: (ox + p[0] * k, oy + (v["h"] - p[1]) * k)
    for it in v["items"]:
        if it["k"] == "p":
            pts = [P(p) for p in it["pts"]]
            path = c.beginPath(); path.moveTo(*pts[0])
            for q in pts[1:]:
                path.lineTo(*q)
            path.close()
            c.setFillColor(hexc(it["fill"]), alpha=it.get("opacity", 1))
            c.setStrokeColor(hexc(it["stroke"]), alpha=it.get("opacity", 1))
            c.setLineWidth(max(0.2, it.get("sw", 0.5) * k))
            c.drawPath(path, stroke=1 if it.get("sw", 0.5) > 0 else 0, fill=1)
        else:
            a, b = P(it["a"]), P(it["b"])
            c.setStrokeColor(hexc(it["stroke"]), alpha=it.get("opacity", 1))
            c.setLineWidth(max(0.2, it.get("sw", 0.5) * k))
            c.line(a[0], a[1], b[0], b[1])
    c.setFillAlpha(1); c.setStrokeAlpha(1)


def draw_render(c, path, x, y, w, h):
    """Растровая визуализация: обрезка «cover» под рамку, без искажения пропорций."""
    try:
        from PIL import Image
        from reportlab.lib.utils import ImageReader
        im = Image.open(path).convert("RGB")
        iw, ih = im.size
        ra, rb = w / h, iw / ih
        if rb > ra:  # картинка шире — режем бока
            nw = int(ih * ra); x0 = (iw - nw) // 2; im = im.crop((x0, 0, x0 + nw, ih))
        else:
            nh = int(iw / ra); y0 = (ih - nh) // 2; im = im.crop((0, y0, iw, y0 + nh))
        c.drawImage(ImageReader(im), x, y, w, h)
        return True
    except Exception:
        return False


def draw_visual(c, d, i, x, y, w, h):
    """Вид i: растровый рендер, если есть, иначе векторный 3D."""
    r = d.get("renders") or []
    if i < len(r) and os.path.exists(r[i]) and draw_render(c, r[i], x, y, w, h):
        return True
    if i < len(d.get("view3d") or []):
        draw_view3d(c, d["view3d"][i], x, y, w, h, bg="#EEF3F7")
        return True
    return False


# ---------------------------------------------------------------- 2D
def draw_sheet(c, sh, x, y, w, h, title=True):
    if title:
        c.setFillColor(INK); draw_text(c, x, y + h - 10, sh["title"], FB, 10)
        c.setStrokeColor(colors.HexColor("#B9C0C8")); c.setLineWidth(0.5); c.line(x, y + h - 13, x + w, y + h - 13)
        h -= 18
    sw, shh = sh["x1"] - sh["x0"], sh["y1"] - sh["y0"]
    k = min(w / sw, h / shh)
    ox = x + (w - sw * k) / 2
    oy = y + (h - shh * k) / 2
    X = lambda v: ox + (v - sh["x0"]) * k
    Y = lambda v: oy + (v - sh["y0"]) * k
    for p in sh["prims"]:
        t = p["t"]
        if t == "line":
            c.setStrokeColor(hexc(p.get("c") or "#222222")); c.setLineWidth(max(0.3, p.get("w", 1) * 0.7))
            c.setDash(4, 3) if p.get("dash") else c.setDash()
            c.line(X(p["x1"]), Y(p["y1"]), X(p["x2"]), Y(p["y2"]))
            c.setDash()
        elif t == "poly":
            pts = [(X(a), Y(b)) for a, b in p["pts"]]
            path = c.beginPath(); path.moveTo(*pts[0])
            for q in pts[1:]:
                path.lineTo(*q)
            path.close()
            fill = p.get("fill")
            if fill:
                c.setFillColor(hexc(fill))
            c.setStrokeColor(hexc(p.get("c") or "#222222")); c.setLineWidth(max(0.3, p.get("w", 1) * 0.7))
            c.drawPath(path, stroke=1, fill=1 if fill else 0)
            if p.get("hatch"):
                hatch(c, path, pts, p["hatch"])
        elif t == "text":
            size = max(6, p.get("size", 0.3) * k * 1.05)
            c.setFillColor(hexc(p.get("c") or "#222222"))
            c.saveState(); c.translate(X(p["x"]), Y(p["y"]))
            if p.get("rot"):
                c.rotate(p["rot"])
            a = p.get("anchor", "start")
            draw_text(c, 0, 0, p["s"].replace("→ ", "").replace("→", ""), FNB if p.get("bold") else FN, size, "center" if a == "middle" else "right" if a == "end" else "left")
            c.restoreState()
        elif t == "dim":
            vert = abs(p["x1"] - p["x2"]) < 1e-6
            if vert:
                ax, ay, bx, by = p["x1"] + p["off"], p["y1"], p["x2"] + p["off"], p["y2"]
            else:
                ax, ay, bx, by = p["x1"], p["y1"] + p["off"], p["x2"], p["y2"] + p["off"]
            c.setStrokeColor(BLUE); c.setLineWidth(0.4)
            c.line(X(p["x1"]), Y(p["y1"]), X(ax), Y(ay)); c.line(X(p["x2"]), Y(p["y2"]), X(bx), Y(by))
            c.setLineWidth(0.7); c.line(X(ax), Y(ay), X(bx), Y(by))
            for qx, qy in ((ax, ay), (bx, by)):
                c.line(X(qx) - 2.5, Y(qy) - 2.5, X(qx) + 2.5, Y(qy) + 2.5)
            c.setFillColor(BLUE)
            mx, my = (X(ax) + X(bx)) / 2, (Y(ay) + Y(by)) / 2
            if vert:
                c.saveState(); c.translate(mx - 3, my); c.rotate(90); draw_text(c, 0, 0, p["s"], FN, 7.5, "center"); c.restoreState()
            else:
                draw_text(c, mx, my + 2.5, p["s"], FN, 7.5, "center")


def hatch(c, path, pts, kind):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    c.saveState()
    c.clipPath(path, stroke=0, fill=0)
    c.setLineWidth(0.3)
    if kind == "prof":
        c.setStrokeColor(colors.Color(0, 0, 0, alpha=0.3)); xx = x0
        while xx < x1:
            c.line(xx, y0, xx, y1); xx += 3
    elif kind == "mesh":
        c.setStrokeColor(colors.Color(0.2, 0.2, 0.2, alpha=0.55)); xx = x0
        while xx < x1:
            c.line(xx, y0, xx, y1); xx += 4
        yy = y0
        while yy < y1:
            c.line(x0, yy, x1, yy); yy += 4
    elif kind in ("concrete", "sand"):
        c.setFillColor(colors.Color(0, 0, 0, alpha=0.3)); step = 5 if kind == "concrete" else 3; yy = y0; row = 0
        while yy < y1:
            xx = x0 + (step / 2 if row % 2 else 0)
            while xx < x1:
                c.circle(xx, yy, 0.4, stroke=0, fill=1); xx += step
            yy += step; row += 1
    elif kind == "gravel":
        c.setStrokeColor(colors.Color(0, 0, 0, alpha=0.4)); yy = y0 + 3; row = 0
        while yy < y1:
            xx = x0 + (4 if row % 2 else 0)
            while xx < x1:
                c.ellipse(xx, yy - 1.2, xx + 4, yy + 1.2, stroke=1, fill=0); xx += 7
            yy += 4; row += 1
    elif kind == "soil":
        c.setStrokeColor(colors.Color(0, 0, 0, alpha=0.3)); d = x0 - (y1 - y0)
        while d < x1:
            c.line(d, y0, d + (y1 - y0), y1); d += 5
    c.restoreState()


# ---------------------------------------------------------------- страницы
def stamp_cell(c, x, y, w, h, text="", font=None, size=7, align="center", pad=1.4 * mm, color=INK):
    c.rect(x, y, w, h, stroke=1, fill=0)
    if text:
        c.setFillColor(color)
        fnt = font or FN
        t = str(text)
        while text_width(t, fnt, size) > w - 2 * pad and len(t) > 3:
            t = t[:-2] + "…"
        tx = x + w / 2 if align == "center" else x + pad if align == "left" else x + w - pad
        draw_text(c, tx, y + (h - size * 0.72) / 2, t, fnt, size, align)


def wrap_lines(text, font, size, width, max_lines):
    words, lines, cur = str(text).split(), [], ""
    for wd in words:
        t = (cur + " " + wd).strip()
        if text_width(t, font, size) <= width:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]; lines[-1] = lines[-1].rstrip(".,") + "…"
    return lines


def frame(c, d, page, title):
    """Рамка листа и основная надпись: на 1-м листе — форма 1 (185×40), дальше — форма 2а (185×15)."""
    total = d.get("_pages") or 0
    # внешняя граница листа (линия обреза) и внутренняя рамка
    c.setStrokeColor(colors.HexColor("#C8CCD2")); c.setLineWidth(0.3); c.rect(2 * mm, 2 * mm, PW - 4 * mm, PH - 4 * mm)
    c.setStrokeColor(LINE); c.setLineWidth(1.6); c.rect(FL, FBm, FR - FL, FT - FBm)
    # заголовок листа
    c.setFillColor(INK); draw_text(c, CL, FT - 10 * mm, title, FB, 14)
    c.setStrokeColor(colors.HexColor("#E8A028")); c.setLineWidth(1.2); c.line(CL, FT - 12.2 * mm, CL + 28 * mm, FT - 12.2 * mm)
    code = d.get("_code") or "ЭП"
    company = d.get("company") or ""
    when = date.today().strftime("%d.%m.%Y")
    sx, sy = FR - STAMP_W, FBm
    c.setStrokeColor(LINE)
    if page == 1:
        H = 40 * mm; r = 5 * mm
        c.setFillColor(colors.white); c.rect(sx, sy, STAMP_W, H, stroke=0, fill=1)
        c.setLineWidth(1.2); c.rect(sx, sy, STAMP_W, H)
        c.setLineWidth(0.5)
        cols = [7, 10, 23, 15, 10]
        # левая часть: 8 строк по 5 мм
        heads = ["Изм.", "Лист", "№ докум.", "Подп.", "Дата"]
        roles = [("Разраб.", company, when), ("Пров.", "", ""), ("Т. контр.", "", ""), ("Утв.", "", "")]
        for row in range(8):
            yy = sy + H - (row + 1) * r
            xx = sx
            if row == 3:
                for wcol, ht in zip(cols, heads):
                    stamp_cell(c, xx, yy, wcol * mm, r, ht, FN, 6.5); xx += wcol * mm
            elif row >= 4:
                role, who, dt = roles[row - 4]
                stamp_cell(c, xx, yy, 17 * mm, r, role, FN, 6.5, "left")
                stamp_cell(c, xx + 17 * mm, yy, 23 * mm, r, who, FN, 6.5, "left")
                stamp_cell(c, xx + 40 * mm, yy, 15 * mm, r)
                stamp_cell(c, xx + 55 * mm, yy, 10 * mm, r, dt[:5] if dt else "", FN, 6)
            else:
                for wcol in cols:
                    stamp_cell(c, xx, yy, wcol * mm, r); xx += wcol * mm
        rx = sx + 65 * mm
        # обозначение
        stamp_cell(c, rx, sy + 25 * mm, 120 * mm, 15 * mm, code, FB, 13)
        # наименование объекта
        c.rect(rx, sy, 70 * mm, 25 * mm)
        lines = wrap_lines(d.get("title") or "Эскизный проект", FB, 9.5, 66 * mm, 3)
        c.setFillColor(INK)
        y0 = sy + 12.5 * mm + (len(lines) - 1) * 5.2 - 1.5
        for i, ln in enumerate(lines):
            draw_text(c, rx + 35 * mm, y0 - i * 10.4, ln, FB, 9.5, "center")
        draw_text(c, rx + 35 * mm, sy + 2.2 * mm, "Эскизный проект", FN, 6.5, "center")
        # стадия / лист / листов
        qx = rx + 70 * mm
        stamp_cell(c, qx, sy + 20 * mm, 15 * mm, r, "Стадия", FN, 6.5)
        stamp_cell(c, qx + 15 * mm, sy + 20 * mm, 15 * mm, r, "Лист", FN, 6.5)
        stamp_cell(c, qx + 30 * mm, sy + 20 * mm, 20 * mm, r, "Листов", FN, 6.5)
        stamp_cell(c, qx, sy + 15 * mm, 15 * mm, r, "ЭП", FNB, 8)
        stamp_cell(c, qx + 15 * mm, sy + 15 * mm, 15 * mm, r, str(page), FNB, 8)
        stamp_cell(c, qx + 30 * mm, sy + 15 * mm, 20 * mm, r, str(total) if total else "", FNB, 8)
        c.rect(qx, sy, 50 * mm, 15 * mm)
        cl = wrap_lines(company or "—", FB, 8, 46 * mm, 2)
        for i, ln in enumerate(cl):
            draw_text(c, qx + 25 * mm, sy + 7.5 * mm + (len(cl) - 1) * 4.6 - 2.6 - i * 9.2, ln, FB, 8, "center")
        c.setLineWidth(1.2); c.rect(sx, sy, STAMP_W, H)
    else:
        H = 15 * mm; r = 5 * mm
        c.setFillColor(colors.white); c.rect(sx, sy, STAMP_W, H, stroke=0, fill=1)
        c.setLineWidth(0.5)
        cols = [7, 10, 23, 15, 10]
        for row in range(3):
            yy = sy + H - (row + 1) * r; xx = sx
            for wcol, ht in zip(cols, ["Изм.", "Лист", "№ докум.", "Подп.", "Дата"]):
                stamp_cell(c, xx, yy, wcol * mm, r, ht if row == 2 else "", FN, 6.5); xx += wcol * mm
        stamp_cell(c, sx + 65 * mm, sy, 110 * mm, H)
        c.setFillColor(INK)
        draw_text(c, sx + 120 * mm, sy + 8.2 * mm, code, FB, 11, "center")
        t = d.get("title") or ""
        while text_width(t, FN, 7) > 104 * mm and len(t) > 3:
            t = t[:-2] + "…"
        draw_text(c, sx + 120 * mm, sy + 3.2 * mm, t, FN, 7, "center")
        stamp_cell(c, sx + 175 * mm, sy + 8 * mm, 10 * mm, 7 * mm, "Лист", FN, 6.5)
        stamp_cell(c, sx + 175 * mm, sy, 10 * mm, 8 * mm, str(page), FNB, 9)
        c.setLineWidth(1.2); c.rect(sx, sy, STAMP_W, H)
    if d.get("freeMark"):
        c.setFillColor(colors.HexColor("#B8862B"))
        draw_text(c, FL, 2.8 * mm, "Составлено в СМЕТА PRO — сметы и проекты для строителей в Telegram", FN, 7)


def table(c, rows, widths, x, y_top, head=True, max_h=None, total_row=False, pad=2.2):
    t = make_table(rows, widths, head, total_row, pad)
    w, h = t.wrapOn(c, sum(widths), max_h or PH)
    t.drawOn(c, x, y_top - h)
    return h


def table_h(rows, widths, head=True, total_row=False, pad=2.2):
    return make_table(rows, widths, head, total_row, pad).wrap(sum(widths), PH)[1]


def make_table(rows, widths, head=True, total_row=False, pad=2.2):
    t = Table(rows, colWidths=widths, repeatRows=1 if head else 0)
    style = [("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#8A9099")), ("BOX", (0, 0), (-1, -1), 1.0, LINE),
             ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), pad), ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
             ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]
    for i in range(1 if head else 0, len(rows)):
        if (i % 2 == 0) and not (total_row and i == len(rows) - 1):
            style.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    if head:
        style += [("BACKGROUND", (0, 0), (-1, 0), HEAD_BG), ("LINEBELOW", (0, 0), (-1, 0), 1.0, LINE)]
    if total_row:
        style += [("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF3D6")), ("LINEABOVE", (0, -1), (-1, -1), 1.0, LINE)]
    t.setStyle(TableStyle(style))
    return t


def P_(s, st="t"):
    return Paragraph(para_text(s), ST[st])


# компактные стили для первого листа (параметры + итоги должны поместиться над штампом)
SC = {k: ParagraphStyle(k + "c", parent=v, fontSize=7.8, leading=9.3) for k, v in ST.items()}
def Pc(s, st="t"):
    return Paragraph(para_text(s), SC[st])


def build(d):
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=landscape(A4))
    c.setTitle(d.get("title") or "Эскизный проект")
    c.setAuthor(d.get("company") or "СМЕТА PRO")
    page = 1
    W1 = CR - CL

    # --- 1. Общий вид и параметры
    frame(c, d, page, f"Эскизный проект: {d.get('title') or ''}")
    logo = d.get("logoPath")
    if logo and os.path.exists(logo):
        try:
            c.drawImage(logo, CR - 38 * mm, FT - 13 * mm, 38 * mm, 11 * mm, preserveAspectRatio=True, mask="auto", anchor="ne")
        except Exception:
            pass
    vw = W1 * 0.6
    c.setStrokeColor(colors.HexColor("#C8CCD2")); c.setLineWidth(0.5)
    c.rect(CL, CB1, vw, CT - CB1)
    draw_visual(c, d, 0, CL + 1, CB1 + 1, vw - 2, CT - CB1 - 2)
    rx = CL + vw + 6 * mm
    rw = CR - rx
    prow = [[Pc("Параметры", "tb"), ""]] + [[Pc(a), Pc(b, "tb")] for a, b in d["params"]]
    summ = [s for s in d["summary"] if s["label"] not in ("Размер в плане", "Столбов", "Плита")]
    def irows(items):
        r = [[Pc("Итоги", "tb"), ""]] + [[Pc(s["label"]), Paragraph(money(s['value']) if s['unit'] == '₽' else f"{qty(s['value'])} {para_text(s['unit'])}", SC["tr"])] for s in items]
        r.append([Pc(d.get("totalLabel") or "Ориентировочная стоимость", "tb"), Paragraph(f"<b>{money(d['total'])}</b>", SC["tr"])])
        return r
    avail = CT - CB1
    # если не помещается — сокращаем итоги, оставляя главное
    h1 = table_h(prow, [rw * 0.48, rw * 0.52], pad=1.4)
    keep = len(summ)
    while keep > 0 and h1 + table_h(irows(summ[:keep]), [rw * 0.6, rw * 0.4], total_row=True, pad=1.4) + 4 * mm > avail:
        keep -= 1
    h = table(c, prow, [rw * 0.48, rw * 0.52], rx, CT, head=True, pad=1.4)
    h2 = table(c, irows(summ[:keep]), [rw * 0.6, rw * 0.4], rx, CT - h - 4 * mm, total_row=True, pad=1.4)
    yy = CT - h - h2 - 8 * mm
    for wtxt in d.get("warnings", [])[:4]:
        p = Paragraph("• " + para_text(wtxt), ParagraphStyle("w", fontName=FN, fontSize=7.5, leading=9.2, textColor=MUT))
        _, ph = p.wrap(rw, 100)
        if yy - ph < CB1:
            break
        p.drawOn(c, rx, yy - ph); yy -= ph + 2.5
    c.showPage(); page += 1

    # --- 1а. Визуализация: ещё два больших ракурса (если есть растровые рендеры)
    rnd = [r for r in (d.get("renders") or []) if os.path.exists(r)]
    if len(rnd) >= 3:
        frame(c, d, page, "Визуализация")
        gap = 4 * mm
        chh = (CT - CB - gap) / 2
        for k in (1, 2):
            cy = CT - k * chh - (k - 1) * gap
            c.setStrokeColor(colors.HexColor("#C8CCD2")); c.setLineWidth(0.5); c.rect(CL, cy, W1, chh)
            draw_render(c, rnd[k], CL + 0.5, cy + 0.5, W1 - 1, chh - 1)
        c.showPage(); page += 1

    sheets = d["sheets"]
    plan = next((s for s in sheets if s["title"].startswith("План")), None)
    sect = next((s for s in sheets if s["title"].startswith("Разрез")), None)
    elev = [s for s in sheets if s["title"].startswith("Вид")]

    if d.get("layout") == "sheets":
        # забор, план участка: каждый чертёж — на свой лист
        for s in sheets:
            frame(c, d, page, s["title"])
            draw_sheet(c, s, CL, CB, W1, CT - CB)
            c.showPage(); page += 1
    else:
        # --- 2. План и разрез
        if not any(s["title"].startswith("Схема") for s in sheets):
            frame(c, d, page, "План и основание")
        scheme = next((s for s in sheets if s["title"].startswith("Схема")), None)
        if scheme:
            # план помещения крупно, справа — разрез 1-1 и схема кровли
            frame(c, d, page, "План помещения")
            if plan:
                draw_sheet(c, plan, CL, CB, W1, CT - CB, title=False)
            c.showPage(); page += 1
            frame(c, d, page, "Разрез и схема каркаса")
            if sect:
                draw_sheet(c, sect, CL, CB, W1 * 0.66, CT - CB)
            draw_sheet(c, scheme, CL + W1 * 0.69, CB + (CT - CB) * 0.4, W1 * 0.31, (CT - CB) * 0.6)
            c.showPage(); page += 1
        else:
            if plan:
                draw_sheet(c, plan, CL, CB, W1 * 0.58, CT - CB)
            if sect:
                draw_sheet(c, sect, CL + W1 * 0.62, CB + (CT - CB) * 0.35, W1 * 0.38, (CT - CB) * 0.65)
            c.showPage(); page += 1

        # --- 3. Фасады
        frame(c, d, page, "Фасады")
        gap = 7 * mm
        cw, ch = (W1 - gap) / 2, (CT - CB - gap) / 2
        for i, s in enumerate(elev[:4]):
            cx = CL + (i % 2) * (cw + gap)
            cy = CB + (1 - i // 2) * (ch + gap)
            draw_sheet(c, s, cx, cy, cw, ch)
        c.showPage(); page += 1

        # --- 3а. Узлы
        nodes = [s for s in sheets if s["title"].startswith("Узел")]
        if nodes and any("Карниз" in s["title"] for s in nodes):
            # мало узлов — каждый на свой лист, крупно
            for s in nodes:
                frame(c, d, page, s["title"] + " (масштаб условный)")
                draw_sheet(c, s, CL, CB, W1, CT - CB, title=False)
                c.showPage(); page += 1
        elif nodes:
            frame(c, d, page, "Узлы (типовые, масштаб условный)")
            big = len(nodes) <= 2
            for i, s in enumerate(nodes[:4]):
                cx = CL + (i % 2) * (cw + gap)
                cy = CB if big else CB + (1 - i // 2) * (ch + gap)
                draw_sheet(c, s, cx, cy, cw, CT - CB if big else ch)
            c.showPage(); page += 1

        # --- 3б. Состав конструкций (стена, пол, кровля) — отдельный лист
        for s in [s for s in sheets if s["title"].startswith("Состав")]:
            frame(c, d, page, s["title"])
            draw_sheet(c, s, CL, CB, W1, CT - CB, title=False)
            c.showPage(); page += 1

    # --- 4. Металл: раскрой
    wood = bool(d.get("wood"))
    if d["steel"]:
        frame(c, d, page, "Спецификация пиломатериалов и раскрой" if wood else "Спецификация металла и раскрой")
        mk, unit_t = ("volNet", "Объём, м³") if wood else ("kgNet", "Масса, кг")
        head = [P_(x, "h") for x in ["Сечение, мм" if wood else "Профиль, мм", "Назначение", "Кусков", "Длина, м", "Доска/брус" if wood else "Хлыст", "Штук" if wood else "Хлыстов", "Обрезь", unit_t]]
        rows = [head] + [[P_(s["profile"], "tb"), P_(s["use"]), P_(str(s["pieces"]), "tc"), P_(qty(s["length"]), "tr"),
                          P_(f"{s['stock']} м", "tc"), Paragraph(f"<b>{s['bars']}</b>", ST["tc"]), P_(f"{qty(s['wastePct'])}%", "tc"), P_(qty(s[mk]), "tr")] for s in d["steel"]]
        rows.append([P_("Итого", "tb"), "", "", P_(qty(sum(s["length"] for s in d["steel"])), "tr"), "", Paragraph(f"<b>{sum(s['bars'] for s in d['steel'])}</b>", ST["tc"]), "",
                     Paragraph(f"<b>{qty(sum(s[mk] for s in d['steel']))}</b>", ST["tr"])])
        widths = [26 * mm, 52 * mm, 15 * mm, 18 * mm, 16 * mm, 17 * mm, 15 * mm, 19 * mm]
        table(c, rows, widths, CL, CT, total_row=True)
        if len(d["view3d"]) > 1 or len(d.get("renders") or []) > 1:
            vx = CL + sum(widths) + 8 * mm
            c.setStrokeColor(colors.HexColor("#C8CCD2")); c.setLineWidth(0.5); c.rect(vx, CT - 70 * mm, CR - vx, 70 * mm)
            draw_visual(c, d, 1, vx + 1, CT - 70 * mm + 1, CR - vx - 2, 70 * mm - 2)
        c.setFillColor(MUT)
        draw_text(c, CL, CB + 2 * mm, "Доски и брус по 6 м — с учётом раскроя. Объём — по фактической длине без обрези." if wood else "Хлысты — с учётом раскроя (пропил 3 мм). Масса — по фактической длине без обрези.", FN, 7.5)
        c.showPage(); page += 1

    # --- 5. Ведомость материалов и работ
    lines = d["lines"]
    def sec_rows(sel):
        out = [[P_(x, "h") for x in ["№", "Наименование", "Кол-во", "Ед.", "Цена, ₽", "Сумма, ₽"]]]
        n = 0
        for l in lines:
            if not sel(l):
                continue
            n += 1
            out.append([P_(str(n), "tc"), P_(l["name"]), P_(qty(l["qty"]), "tr"), P_(l["unit"], "tc"),
                        P_(money(l["price"]).replace(" ₽", "").replace(" ₽", ""), "tr"), P_(money(l["qty"] * l["price"]).replace(" ₽", "").replace(" ₽", ""), "tr")])
        return out
    widths = [9 * mm, W1 - 9 * mm - 22 * mm - 18 * mm - 26 * mm - 30 * mm, 22 * mm, 18 * mm, 26 * mm, 30 * mm]
    avail = CT - CB - 16 * mm  # снизу место под «Итого»
    sections = (("Ведомость материалов", lambda l: l["type"] == "material"), ("Работы и техника", lambda l: l["type"] != "material"))
    # hideWorks: работы не расписываем — под материалами общая сумма работ и итог
    for title, sel in (sections[:1] if d.get("hideWorks") else sections):
        rows = sec_rows(sel)
        frame(c, d, page, title)
        start = 1
        while start < len(rows):
            n = 1
            while start + n < len(rows) and table_h([rows[0]] + rows[start:start + n + 1], widths) <= avail:
                n += 1
            chunk = [rows[0]] + rows[start:start + n]
            table(c, chunk, widths, CL, CT)
            start += n
            if start < len(rows):
                c.showPage(); page += 1; frame(c, d, page, title + " (продолжение)")
        tot = sum(l["qty"] * l["price"] for l in lines if sel(l))
        c.setFillColor(INK)
        if not d.get("hideWorks"):
            draw_text(c, CR, CB + 9 * mm, f"Итого: {money(tot)}", FB, 10.5, "right")
        if d.get("hideWorks"):
            works = sum(l["qty"] * l["price"] for l in lines if l["type"] != "material")
            draw_text(c, CR, CB + 9 * mm, f"Материалы: {money(tot)}   ·   Работы: {money(works)}", FB, 10.5, "right")
            draw_text(c, CR, CB + 2 * mm, f"Всего по проекту: {money(d['total'])}", FB, 13, "right")
        elif title == "Работы и техника":
            draw_text(c, CR, CB + 2 * mm, f"Всего по проекту: {money(d['total'])}", FB, 13, "right")
        c.showPage(); page += 1

    c.save()
    return buf.getvalue(), page - 1


def render(d):
    """Два прохода: сначала считаем листы, потом рисуем с «Листов: N» в штампе."""
    d = dict(d)
    d.setdefault("_code", "ЭП-" + date.today().strftime("%y%m%d"))
    _, total = build(d)
    d["_pages"] = total
    pdf, _ = build(d)
    return pdf


if __name__ == "__main__":
    sys.stdout.buffer.write(render(json.load(sys.stdin)))
