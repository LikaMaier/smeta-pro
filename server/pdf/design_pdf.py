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
M = 12 * mm
INK = colors.HexColor("#222222")
BLUE = colors.HexColor("#1f5fae")
MUT = colors.HexColor("#666666")
ST = {
    "t": ParagraphStyle("t", fontName="DV", fontSize=8, leading=10, textColor=INK),
    "tb": ParagraphStyle("tb", fontName="DV-B", fontSize=8, leading=10, textColor=INK),
    "tr": ParagraphStyle("tr", fontName="DV", fontSize=8, leading=10, textColor=INK, alignment=TA_RIGHT),
    "tc": ParagraphStyle("tc", fontName="DV", fontSize=8, leading=10, textColor=INK, alignment=TA_CENTER),
    "h": ParagraphStyle("h", fontName="DV-B", fontSize=8, leading=10, textColor=INK, alignment=TA_CENTER),
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


# ---------------------------------------------------------------- 2D
def draw_sheet(c, sh, x, y, w, h, title=True):
    if title:
        c.setFont("DV-B", 9); c.setFillColor(INK); c.drawString(x, y + h - 9, sh["title"])
        h -= 14
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
            size = max(5.5, p.get("size", 0.3) * k)
            c.setFont("DV-B" if p.get("bold") else "DV", size)
            c.setFillColor(hexc(p.get("c") or "#222222"))
            c.saveState(); c.translate(X(p["x"]), Y(p["y"]))
            if p.get("rot"):
                c.rotate(p["rot"])
            a = p.get("anchor", "start")
            (c.drawCentredString if a == "middle" else c.drawRightString if a == "end" else c.drawString)(0, 0, p["s"])
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
            c.setFillColor(BLUE); c.setFont("DV", 7)
            mx, my = (X(ax) + X(bx)) / 2, (Y(ay) + Y(by)) / 2
            if vert:
                c.saveState(); c.translate(mx - 3, my); c.rotate(90); c.drawCentredString(0, 0, p["s"]); c.restoreState()
            else:
                c.drawCentredString(mx, my + 2.5, p["s"])


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
def frame(c, d, page, title):
    c.setStrokeColor(colors.HexColor("#999999")); c.setLineWidth(0.6)
    c.rect(M / 2, M / 2, PW - M, PH - M)
    # штамп
    sw, shh = 120 * mm, 16 * mm
    sx, sy = PW - M / 2 - sw, M / 2
    c.rect(sx, sy, sw, shh)
    c.setFont("DV-B", 8); c.setFillColor(INK); c.drawString(sx + 3, sy + shh - 9, (d.get("title") or "Эскизный проект")[:70])
    c.setFont("DV", 7); c.setFillColor(MUT)
    c.drawString(sx + 3, sy + 4, f"{d.get('company') or ''}"[:60])
    c.drawRightString(sx + sw - 3, sy + 4, f"{date.today().strftime('%d.%m.%Y')} · лист {page}")
    c.setFont("DV-B", 11); c.setFillColor(INK); c.drawString(M, PH - M - 4, title)
    if d.get("freeMark"):
        c.setFont("DV", 7); c.setFillColor(colors.HexColor("#B8862B"))
        c.drawString(M, M / 2 + 3, "Составлено в СМЕТА PRO — сметы и проекты для строителей в Telegram")


def table(c, rows, widths, x, y_top, head=True, max_h=None):
    t = Table(rows, colWidths=widths, repeatRows=1 if head else 0)
    style = [("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#888888")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
             ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]
    if head:
        style.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEEEE")))
    t.setStyle(TableStyle(style))
    w, h = t.wrapOn(c, sum(widths), max_h or PH)
    t.drawOn(c, x, y_top - h)
    return h


def build(d):
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=landscape(A4))
    c.setTitle(d.get("title") or "Эскизный проект")
    page = 1

    # --- 1. Общий вид и параметры
    frame(c, d, page, f"Эскизный проект: {d.get('title') or ''}")
    logo = d.get("logoPath")
    if logo and os.path.exists(logo):
        try:
            c.drawImage(logo, PW - M - 40 * mm, PH - M - 16 * mm, 38 * mm, 14 * mm, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass
    draw_view3d(c, d["view3d"][0], M, M + 20 * mm, PW * 0.6, PH - 2 * M - 30 * mm, bg="#EEF3F7")
    rx = M + PW * 0.6 + 8 * mm
    rw = PW - rx - M
    rows = [[Paragraph("<b>Параметры</b>", ST["t"]), ""]] + [[Paragraph(esc(a), ST["t"]), Paragraph(esc(b), ST["tb"])] for a, b in d["params"]]
    h = table(c, rows, [rw * 0.55, rw * 0.45], rx, PH - M - 22 * mm, head=True)
    rows = [[Paragraph("<b>Итоги</b>", ST["t"]), ""]] + [[Paragraph(esc(s["label"]), ST["t"]), Paragraph(f"{qty(s['value'])} {esc(s['unit'])}", ST["tr"])] for s in d["summary"] if s["label"] not in ("Размер в плане", "Столбов", "Плита")]
    rows.append([Paragraph("<b>Ориентировочная стоимость</b>", ST["t"]), Paragraph(f"<b>{money(d['total'])}</b>", ST["tr"])])
    h2 = table(c, rows, [rw * 0.55, rw * 0.45], rx, PH - M - 26 * mm - h)
    yy = PH - M - 30 * mm - h - h2
    c.setFont("DV", 7); c.setFillColor(MUT)
    for wtxt in d.get("warnings", [])[:4]:
        p = Paragraph(esc(wtxt), ParagraphStyle("w", fontName="DV", fontSize=7, leading=9, textColor=MUT))
        _, ph = p.wrap(rw, 100)
        if yy - ph < M + 20 * mm:
            break
        p.drawOn(c, rx, yy - ph); yy -= ph + 3
    c.showPage(); page += 1

    sheets = d["sheets"]
    plan = next((s for s in sheets if s["title"].startswith("План")), None)
    sect = next((s for s in sheets if s["title"].startswith("Разрез")), None)
    elev = [s for s in sheets if s["title"].startswith("Вид")]

    # --- 2. План и разрез
    frame(c, d, page, "План и основание")
    if plan:
        draw_sheet(c, plan, M, M + 20 * mm, PW * 0.58, PH - 2 * M - 30 * mm)
    if sect:
        draw_sheet(c, sect, M + PW * 0.6, PH * 0.45, PW * 0.37, PH * 0.4)
    c.showPage(); page += 1

    # --- 3. Фасады
    frame(c, d, page, "Фасады")
    cw, ch = (PW - 2 * M - 8 * mm) / 2, (PH - 2 * M - 34 * mm) / 2
    for i, s in enumerate(elev[:4]):
        cx = M + (i % 2) * (cw + 8 * mm)
        cy = M + 20 * mm + (1 - i // 2) * (ch + 4 * mm)
        draw_sheet(c, s, cx, cy, cw, ch)
    c.showPage(); page += 1

    # --- 4. Металл: раскрой
    wood = bool(d.get("wood"))
    frame(c, d, page, "Спецификация пиломатериалов и раскрой" if wood else "Спецификация металла и раскрой")
    if len(d["view3d"]) > 1:
        draw_view3d(c, d["view3d"][1], PW - M - 95 * mm, PH - M - 75 * mm, 90 * mm, 65 * mm, bg="#EEF3F7")
    mk, unit_t = ("volNet", "Объём, м³") if wood else ("kgNet", "Масса, кг")
    head = [Paragraph(x, ST["h"]) for x in ["Сечение, мм" if wood else "Профиль, мм", "Назначение", "Кусков", "Длина, м", "Доска/брус" if wood else "Хлыст", "Штук" if wood else "Хлыстов", "Обрезь", unit_t]]
    rows = [head] + [[Paragraph(s["profile"], ST["tb"]), Paragraph(esc(s["use"]), ST["t"]), Paragraph(str(s["pieces"]), ST["tc"]), Paragraph(qty(s["length"]), ST["tr"]),
                      Paragraph(f"{s['stock']} м", ST["tc"]), Paragraph(f"<b>{s['bars']}</b>", ST["tc"]), Paragraph(f"{qty(s['wastePct'])}%", ST["tc"]), Paragraph(qty(s[mk]), ST["tr"])] for s in d["steel"]]
    rows.append([Paragraph("<b>Итого</b>", ST["t"]), "", "", Paragraph(qty(sum(s["length"] for s in d["steel"])), ST["tr"]), "", Paragraph(f"<b>{sum(s['bars'] for s in d['steel'])}</b>", ST["tc"]), "",
                 Paragraph(f"<b>{qty(sum(s[mk] for s in d['steel']))}</b>", ST["tr"])])
    table(c, rows, [28 * mm, 50 * mm, 16 * mm, 20 * mm, 16 * mm, 18 * mm, 16 * mm, 20 * mm], M, PH - M - 14 * mm)
    c.setFont("DV", 7); c.setFillColor(MUT)
    c.drawString(M, M + 22 * mm, "Доски и брус по 6 м — с учётом раскроя. Объём — по фактической длине без обрези." if wood else "Хлысты — с учётом раскроя (пропил 3 мм). Масса — по фактической длине без обрези.")
    c.showPage(); page += 1

    # --- 5. Ведомость материалов и работ
    lines = d["lines"]
    def sec_rows(sel):
        out = [[Paragraph(x, ST["h"]) for x in ["№", "Наименование", "Кол-во", "Ед.", "Цена", "Сумма"]]]
        n = 0
        for l in lines:
            if not sel(l):
                continue
            n += 1
            out.append([Paragraph(str(n), ST["tc"]), Paragraph(esc(l["name"]), ST["t"]), Paragraph(qty(l["qty"]), ST["tr"]), Paragraph(esc(l["unit"]), ST["tc"]),
                        Paragraph(money(l["price"]).replace(" ₽", ""), ST["tr"]), Paragraph(money(l["qty"] * l["price"]).replace(" ₽", ""), ST["tr"])])
        return out
    widths = [8 * mm, 118 * mm, 22 * mm, 22 * mm, 26 * mm, 30 * mm]
    for title, sel in (("Ведомость материалов", lambda l: l["type"] == "material"), ("Работы и техника", lambda l: l["type"] != "material")):
        rows = sec_rows(sel)
        frame(c, d, page, title)
        # постранично
        start = 1
        y_top = PH - M - 14 * mm
        while start < len(rows):
            chunk = [rows[0]] + rows[start:start + 28]
            table(c, chunk, widths, M, y_top)
            start += 28
            if start < len(rows):
                c.showPage(); page += 1; frame(c, d, page, title + " (продолжение)")
        tot = sum(l["qty"] * l["price"] for l in lines if sel(l))
        c.setFont("DV-B", 9); c.setFillColor(INK); c.drawRightString(M + sum(widths), M + 30 * mm, f"Итого: {money(tot)}")
        if title == "Работы и техника":
            c.setFont("DV-B", 11); c.drawRightString(M + sum(widths), M + 23 * mm, f"Всего по проекту: {money(d['total'])}")
        c.showPage(); page += 1

    c.save()
    return buf.getvalue()


if __name__ == "__main__":
    sys.stdout.buffer.write(build(json.load(sys.stdin)))
