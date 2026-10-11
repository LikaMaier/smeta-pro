#!/usr/bin/env python3
"""
PDF сметы для заказчика. Читает JSON из stdin, пишет PDF в stdout.
Только то, что видит заказчик: без закупочных цен, себестоимости и прибыли.
"""
import io
import json
import os
import sys
from datetime import date, datetime, timedelta

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_DIRS = [os.environ.get("PDF_FONT_DIR", ""), "/usr/share/fonts/truetype/dejavu", os.path.join(os.path.dirname(__file__), "fonts")]


def find_font(name):
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if d and os.path.exists(p):
            return p
    raise SystemExit(f"Шрифт {name} не найден")


pdfmetrics.registerFont(TTFont("DV", find_font("DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DV-B", find_font("DejaVuSans-Bold.ttf")))

INK = colors.HexColor("#2B1A0E")
MUTED = colors.HexColor("#7A6450")
GOLD = colors.HexColor("#B8862B")
BAND = colors.HexColor("#F6EBD3")
LINE = colors.HexColor("#E2D3B5")

S = {
    "company": ParagraphStyle("c", fontName="DV-B", fontSize=15, leading=18, textColor=INK),
    "contacts": ParagraphStyle("ct", fontName="DV", fontSize=8.5, leading=11, textColor=MUTED, alignment=TA_RIGHT),
    "title": ParagraphStyle("t", fontName="DV-B", fontSize=17, leading=21, textColor=INK, spaceBefore=4),
    "sub": ParagraphStyle("s", fontName="DV", fontSize=9.5, leading=12, textColor=MUTED),
    "cell": ParagraphStyle("cell", fontName="DV", fontSize=8.8, leading=11, textColor=INK),
    "cellr": ParagraphStyle("cellr", fontName="DV", fontSize=8.8, leading=11, textColor=INK, alignment=TA_RIGHT),
    "head": ParagraphStyle("h", fontName="DV-B", fontSize=8.3, leading=10, textColor=INK),
    "headr": ParagraphStyle("hr", fontName="DV-B", fontSize=8.3, leading=10, textColor=INK, alignment=TA_RIGHT),
    "cat": ParagraphStyle("cat", fontName="DV-B", fontSize=9, leading=11, textColor=GOLD),
    "label": ParagraphStyle("l", fontName="DV", fontSize=9.5, leading=12, textColor=INK),
    "labelr": ParagraphStyle("lr", fontName="DV", fontSize=9.5, leading=12, textColor=INK, alignment=TA_RIGHT),
    "total": ParagraphStyle("tt", fontName="DV-B", fontSize=12.5, leading=15, textColor=INK),
    "totalr": ParagraphStyle("ttr", fontName="DV-B", fontSize=12.5, leading=15, textColor=INK, alignment=TA_RIGHT),
    "words": ParagraphStyle("w", fontName="DV", fontSize=9, leading=12, textColor=MUTED),
    "h2": ParagraphStyle("h2", fontName="DV-B", fontSize=10.5, leading=13, textColor=INK, spaceBefore=10, spaceAfter=3),
    "body": ParagraphStyle("b", fontName="DV", fontSize=9.5, leading=13, textColor=INK),
}


def esc(s):
    return (str(s or "")).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")


def money(v):
    v = round(float(v or 0), 2)
    whole = int(abs(v))
    kop = int(round((abs(v) - whole) * 100))
    s = f"{whole:,}".replace(",", " ")
    if kop:
        s += f",{kop:02d}"
    return ("−" if v < 0 else "") + s + " ₽"


def qty(v):
    v = float(v or 0)
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


# ---------- сумма прописью ----------
ONES = [["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
        ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]]
TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]
ORDERS = [(("", "", ""), 0), (("тысяча", "тысячи", "тысяч"), 1), (("миллион", "миллиона", "миллионов"), 0), (("миллиард", "миллиарда", "миллиардов"), 0)]


def plural(n, forms):
    n = abs(n) % 100
    if 11 <= n <= 19:
        return forms[2]
    n %= 10
    return forms[0] if n == 1 else forms[1] if 2 <= n <= 4 else forms[2]


def triad(n, gender):
    words = []
    h, t, o = n // 100, (n // 10) % 10, n % 10
    if h:
        words.append(HUNDREDS[h])
    if t == 1:
        words.append(TEENS[o])
    else:
        if t:
            words.append(TENS[t])
        if o:
            words.append(ONES[gender][o])
    return words


def rub_words(v):
    v = round(float(v or 0), 2)
    rub = int(v)
    kop = int(round((v - rub) * 100))
    if rub == 0:
        words = ["ноль"]
    else:
        words, i, n = [], 0, rub
        while n > 0 and i < len(ORDERS):
            part = n % 1000
            if part:
                forms, gender = ORDERS[i]
                w = triad(part, gender)
                if i:
                    w.append(plural(part, forms))
                words = w + words
            n //= 1000
            i += 1
    text = " ".join(words)
    text = text[0].upper() + text[1:]
    return f"{text} {plural(rub, ('рубль', 'рубля', 'рублей'))} {kop:02d} {plural(kop, ('копейка', 'копейки', 'копеек'))}"


# ---------- документ ----------
def build(d):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
                            title=d.get("title") or "Смета", author=d.get("company") or "")
    W = doc.width
    els = []

    # Шапка: исполнитель и контакты
    head = Table([[Paragraph(esc(d.get("company") or "Смета"), S["company"]), Paragraph(esc(d.get("contacts")), S["contacts"])]],
                 colWidths=[W * 0.55, W * 0.45])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), 1.2, GOLD),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    els += [head, Spacer(1, 8)]

    d_date = d.get("date") or date.today().isoformat()
    try:
        dd = datetime.fromisoformat(d_date[:10]).date()
    except ValueError:
        dd = date.today()
    valid = d.get("validDays") or 14
    number = d.get("number") or ""
    els.append(Paragraph(esc(d.get("title") or "Смета"), S["title"]))
    els.append(Paragraph(f"Смета{(' № ' + esc(number)) if number else ''} от {dd.strftime('%d.%m.%Y')} · действительна до {(dd + timedelta(days=int(valid))).strftime('%d.%m.%Y')}", S["sub"]))
    els.append(Spacer(1, 8))

    info = [(k, v) for k, v in [("Заказчик", d.get("customer")), ("Адрес объекта", d.get("address"))] if v]
    if info:
        t = Table([[Paragraph(k, S["sub"]), Paragraph(esc(v), S["label"])] for k, v in info], colWidths=[32 * mm, W - 32 * mm])
        t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
        els += [t, Spacer(1, 10)]

    # Таблица позиций
    cw = [9 * mm, W - 9 * mm - 18 * mm - 14 * mm - 24 * mm - 27 * mm, 18 * mm, 14 * mm, 24 * mm, 27 * mm]
    rows = [[Paragraph("№", S["head"]), Paragraph("Наименование работ и материалов", S["head"]), Paragraph("Кол-во", S["headr"]),
             Paragraph("Ед.", S["head"]), Paragraph("Цена", S["headr"]), Paragraph("Сумма", S["headr"])]]
    style = [("BACKGROUND", (0, 0), (-1, 0), BAND), ("LINEBELOW", (0, 0), (-1, 0), 0.8, GOLD), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]
    lines = d.get("lines") or []
    grouped = d.get("grouped") and any(l.get("category") for l in lines)
    groups = []
    if grouped:
        order = []
        for l in lines:
            c = l.get("category") or "Прочее"
            if c not in order:
                order.append(c)
        groups = [(c, [l for l in lines if (l.get("category") or "Прочее") == c]) for c in order]
    else:
        groups = [(None, lines)]
    n = 0
    for cat, items in groups:
        if cat:
            rows.append([Paragraph(esc(cat), S["cat"]), "", "", "", "", Paragraph(money(sum(float(i.get("amount") or 0) for i in items)), S["headr"])])
            style += [("SPAN", (0, len(rows) - 1), (4, len(rows) - 1)), ("TOPPADDING", (0, len(rows) - 1), (-1, len(rows) - 1), 7)]
        for l in items:
            n += 1
            name = esc(l.get("name"))
            if l.get("note"):
                name += f"<br/><font color='#7A6450' size='7.5'>{esc(l.get('note'))}</font>"
            rows.append([Paragraph(str(n), S["cell"]), Paragraph(name, S["cell"]), Paragraph(qty(l.get("qty")), S["cellr"]),
                         Paragraph(esc(l.get("unit")), S["cell"]), Paragraph(money(l.get("price")), S["cellr"]), Paragraph(money(l.get("amount")), S["cellr"])])
            style.append(("LINEBELOW", (0, len(rows) - 1), (-1, len(rows) - 1), 0.4, LINE))
    if n == 0:
        rows.append(["", Paragraph("Позиции не добавлены", S["cell"]), "", "", "", ""])
    table = Table(rows, colWidths=cw, repeatRows=1)
    table.setStyle(TableStyle(style))
    els += [table, Spacer(1, 8)]

    # Итоги (без внутренней экономики)
    t = d.get("totals") or {}
    tr = []
    def add(label, value, neg=False):
        if value:
            tr.append([Paragraph(label, S["labelr"]), Paragraph(("−" if neg else "") + money(value), S["labelr"])])
    add("Работы", t.get("works"))
    add("Материалы", t.get("materials"))
    add("Техника, услуги и прочее", t.get("other"))
    add("Накладные и непредвиденные расходы", t.get("overhead"))
    add("Доставка", t.get("delivery"))
    add("Дополнительные расходы", t.get("extraCosts"))
    add(f"Скидка {qty(t.get('discountPct'))}%", t.get("discount"), neg=True)
    add(f"Налог {qty(t.get('taxPct'))}%", t.get("tax"))
    tr.append([Paragraph("Итого к оплате", S["totalr"]), Paragraph(money(t.get("total")), S["totalr"])])
    tt = Table(tr, colWidths=[W - 42 * mm, 42 * mm])
    tt.setStyle(TableStyle([("LINEABOVE", (0, len(tr) - 1), (-1, len(tr) - 1), 1.2, GOLD), ("TOPPADDING", (0, len(tr) - 1), (-1, len(tr) - 1), 6),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -2), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -2), 1.5)]))
    els.append(KeepTogether([tt, Spacer(1, 3), Paragraph(f"Сумма прописью: {rub_words(t.get('total'))}", ParagraphStyle('wr', parent=S['words'], alignment=TA_RIGHT))]))

    if d.get("paymentTerms"):
        els += [Paragraph("Условия оплаты", S["h2"]), Paragraph(esc(d.get("paymentTerms")), S["body"])]
    if d.get("notes"):
        els += [Paragraph("Примечания", S["h2"]), Paragraph(esc(d.get("notes")), S["body"])]

    sign = Table([[Paragraph("Исполнитель ____________________", S["label"]), Paragraph("Заказчик ____________________", S["labelr"])]], colWidths=[W / 2, W / 2])
    sign.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    els += [Spacer(1, 22), KeepTogether([sign])]

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("DV", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 9 * mm, (d.get("company") or "") + (f" · {d.get('title')}" if d.get("title") else ""))
        canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, f"Стр. {doc_.page}")
        canvas.restoreState()

    doc.build(els, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


if __name__ == "__main__":
    data = json.load(sys.stdin)
    sys.stdout.buffer.write(build(data))
