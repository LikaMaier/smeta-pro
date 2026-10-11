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
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_DIRS = [os.environ.get("PDF_FONT_DIR", ""), "/usr/share/fonts/truetype/dejavu", os.path.join(os.path.dirname(__file__), "fonts")]


def find_font(name):
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if d and os.path.exists(p):
            return p
    raise SystemExit(f"Шрифт {name} не найден")


pdfmetrics.registerFont(TTFont("DV", find_font("DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DV-B", find_font("DejaVuSans-Bold.ttf")))
registerFontFamily("DV", normal="DV", bold="DV-B", italic="DV", boldItalic="DV-B")

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
    "clause": ParagraphStyle("cl", fontName="DV", fontSize=9.3, leading=12.6, textColor=INK, spaceAfter=2.5),
    "ok": ParagraphStyle("ok", fontName="DV-B", fontSize=9.5, leading=12, textColor=colors.HexColor("#2E7D4F")),
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
def fmt_date(v, default=None):
    try:
        return datetime.fromisoformat(str(v)[:10]).date()
    except (TypeError, ValueError):
        return default


def image(path, max_w, max_h):
    """Картинка с сохранением пропорций; None, если файла нет или он битый"""
    if not path or not os.path.exists(path):
        return None
    try:
        iw, ih = ImageReader(path).getSize()
        k = min(max_w / iw, max_h / ih)
        return Image(path, width=iw * k, height=ih * k)
    except Exception:
        return None


def header(d, W):
    logo = image(d.get("logoPath"), 38 * mm, 16 * mm)
    name = Paragraph(esc(d.get("company") or "Смета"), S["company"])
    left = Table([[logo, name]], colWidths=[logo.drawWidth + 4 * mm, None]) if logo else name
    if logo:
        left.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                  ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    head = Table([[left, Paragraph(esc(d.get("contacts")), S["contacts"])]], colWidths=[W * 0.62, W * 0.38])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), 1.2, GOLD),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return [head, Spacer(1, 8)]


def items_block(d, W):
    """Таблица позиций и итоги — общая для сметы, акта и приложения к договору"""
    els = []
    cw = [9 * mm, W - 9 * mm - 18 * mm - 14 * mm - 24 * mm - 27 * mm, 18 * mm, 14 * mm, 24 * mm, 27 * mm]
    rows = [[Paragraph("№", S["head"]), Paragraph("Наименование работ и материалов", S["head"]), Paragraph("Кол-во", S["headr"]),
             Paragraph("Ед.", S["head"]), Paragraph("Цена", S["headr"]), Paragraph("Сумма", S["headr"])]]
    style = [("BACKGROUND", (0, 0), (-1, 0), BAND), ("LINEBELOW", (0, 0), (-1, 0), 0.8, GOLD), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]
    lines = d.get("lines") or []
    grouped = d.get("grouped") and any(l.get("category") for l in lines)
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
    return els


def sign_block(d, W, left="Исполнитель", right="Заказчик", captions=None):
    """Строки подписей; подпись/печать исполнителя (картинка) ставится над его линией"""
    sig = image(d.get("signPath"), 42 * mm, 18 * mm)
    rows = []
    if captions:
        rows.append([Paragraph(captions[0], S["sub"]), Paragraph(captions[1], ParagraphStyle('sr', parent=S['sub'], alignment=TA_RIGHT))])
    rows.append([sig or "", ""])
    rows.append([Paragraph(f"{left} ____________________", S["label"]), Paragraph(f"{right} ____________________", S["labelr"])])
    t = Table(rows, colWidths=[W / 2, W / 2], rowHeights=[None] * (len(rows) - 2) + [(sig.drawHeight if sig else 4 * mm), None])
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                           ("BOTTOMPADDING", (0, len(rows) - 2), (-1, len(rows) - 2), -6 * mm if sig else 0), ("LEFTPADDING", (0, len(rows) - 2), (0, len(rows) - 2), 24 * mm)]))
    return t


def contract(d, W):
    """Договор подряда: текст + реквизиты, смета — приложением № 1"""
    t = d.get("totals") or {}
    num = d.get("number") or ""
    cd = fmt_date(d.get("contractDate"), date.today())
    exe = esc(d.get("company") or "______________________")
    cust = esc(d.get("customer") or "______________________")
    addr = esc(d.get("address") or "______________________")
    ws, we = fmt_date(d.get("workStart")), fmt_date(d.get("workEnd"))
    start = ws.strftime("%d.%m.%Y") if ws else "в течение 3 (трёх) рабочих дней после поступления аванса"
    end = we.strftime("%d.%m.%Y") if we else "в сроки, согласованные Сторонами"
    warranty = int(d.get("warrantyMonths") or 0)
    terms = esc(d.get("paymentTerms")) if d.get("paymentTerms") else \
        "Окончательный расчёт производится в течение 3 (трёх) рабочих дней после подписания Сторонами Акта выполненных работ."
    els = [Paragraph(f"Договор подряда{(' № ' + esc(num)) if num else ''}", S["title"]),
           Paragraph(f"{cd.strftime('%d.%m.%Y')}", S["sub"]), Spacer(1, 8),
           Paragraph(f"{exe}, именуемый(ая) в дальнейшем «Подрядчик», с одной стороны, и {cust}, именуемый(ая) в дальнейшем «Заказчик», "
                     "с другой стороны, вместе именуемые «Стороны», заключили настоящий Договор о нижеследующем.", S["body"])]
    sections = [
        ("1. Предмет договора", [
            f"1.1. Подрядчик обязуется по заданию Заказчика выполнить работы на объекте по адресу: {addr}, а Заказчик обязуется принять результат работ и оплатить его.",
            "1.2. Состав, объём и стоимость работ и материалов определяются Сметой (Приложение № 1), которая является неотъемлемой частью Договора.",
        ]),
        ("2. Стоимость и порядок оплаты", [
            f"2.1. Стоимость работ по Договору составляет {money(t.get('total'))} ({rub_words(t.get('total'))}).",
            f"2.2. Порядок оплаты: {terms}",
            "2.3. Работы, не предусмотренные Сметой, выполняются по дополнительному соглашению Сторон и оплачиваются отдельно.",
        ]),
        ("3. Сроки выполнения работ", [
            f"3.1. Начало работ: {start}. Окончание работ: {end}.",
            "3.2. Сроки переносятся соразмерно задержке, если Заказчик задерживает оплату или не обеспечивает доступ на объект, "
            "а также при погодных условиях, при которых выполнение работ невозможно по технологии.",
        ]),
        ("4. Обязанности сторон", [
            "4.1. Подрядчик обязуется: выполнить работы качественно, в соответствии со Сметой и строительными нормами; соблюдать технику безопасности; "
            "сообщать Заказчику об обстоятельствах, которые могут повлиять на сроки или качество работ; после окончания работ передать Заказчику объект и Акт выполненных работ.",
            "4.2. Заказчик обязуется: обеспечить доступ на объект, а также электроэнергию и воду, необходимые для работ; своевременно производить оплату; принять выполненные работы.",
        ]),
        ("5. Приёмка работ", [
            "5.1. По окончании работ Подрядчик передаёт Заказчику Акт выполненных работ. В течение 3 (трёх) рабочих дней Заказчик подписывает Акт "
            "либо передаёт Подрядчику письменный мотивированный отказ с перечнем недостатков.",
            "5.2. Недостатки, допущенные по вине Подрядчика, устраняются им за свой счёт в согласованный Сторонами срок.",
        ]),
        ("6. Гарантия", [
            (f"6.1. Гарантийный срок на выполненные работы — {warranty} мес. с даты подписания Акта выполненных работ." if warranty else
             "6.1. Гарантийный срок на выполненные работы определяется законодательством Российской Федерации."),
            "6.2. Гарантия не распространяется на недостатки, возникшие вследствие нормального износа, неправильной эксплуатации или вмешательства третьих лиц.",
        ]),
        ("7. Ответственность и разрешение споров", [
            "7.1. За неисполнение или ненадлежащее исполнение обязательств Стороны несут ответственность в соответствии с законодательством Российской Федерации.",
            "7.2. Споры решаются путём переговоров, а при недостижении согласия — в порядке, установленном законодательством Российской Федерации.",
        ]),
        ("8. Заключительные положения", [
            "8.1. Договор вступает в силу с момента подписания и действует до полного исполнения Сторонами обязательств.",
            "8.2. Изменения и дополнения к Договору действительны, если они оформлены письменно и подписаны Сторонами.",
            "8.3. Договор составлен в двух экземплярах, имеющих равную силу, по одному для каждой из Сторон.",
            "8.4. Приложение: № 1 — Смета.",
        ]),
    ]
    for title, items in sections:
        els.append(Paragraph(title, S["h2"]))
        for it in items:
            els.append(Paragraph(it, S["clause"]))
    # Реквизиты
    req_l = f"<b>Подрядчик</b><br/>{exe}" + (f"<br/>{esc(d.get('contacts'))}" if d.get("contacts") else "")
    req_r = f"<b>Заказчик</b><br/>{cust}" + (f"<br/>{esc(d.get('customerDetails'))}" if d.get("customerDetails") else "<br/>Паспорт / реквизиты: ____________________")
    req = Table([[Paragraph(req_l, S["body"]), Paragraph(req_r, S["body"])]], colWidths=[W / 2, W / 2])
    req.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    els += [KeepTogether([Paragraph("9. Реквизиты и подписи Сторон", S["h2"]), req, Spacer(1, 14), sign_block(d, W, "Подрядчик", "Заказчик")])]
    # Приложение № 1 — смета
    els += [PageBreak(), Paragraph(f"Приложение № 1 к Договору подряда{(' № ' + esc(num)) if num else ''} от {cd.strftime('%d.%m.%Y')}", S["sub"]),
            Paragraph(f"Смета: {esc(d.get('title') or '')}", S["title"]), Spacer(1, 8)]
    els += items_block(d, W)
    els += [Spacer(1, 22), KeepTogether(sign_block(d, W, "Подрядчик", "Заказчик"))]
    return els


def build(d):
    buf = io.BytesIO()
    kind = d.get("docType") or "estimate"
    titles = {"act": "Акт выполненных работ", "contract": "Договор подряда"}
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
                            title=titles.get(kind, d.get("title") or "Смета"), author=d.get("company") or "")
    W = doc.width
    els = header(d, W)

    if kind == "contract":
        els += contract(d, W)
    else:
        is_act = kind == "act"
        dd = fmt_date(d.get("actDate") if is_act else d.get("date"), date.today())
        valid = d.get("validDays") or 14
        number = d.get("number") or ""
        if is_act:
            els.append(Paragraph(f"Акт{(' № ' + esc(number)) if number else ''} выполненных работ", S["title"]))
            els.append(Paragraph(f"от {dd.strftime('%d.%m.%Y')} · по смете «{esc(d.get('title') or '')}»", S["sub"]))
        else:
            els.append(Paragraph(esc(d.get("title") or "Смета"), S["title"]))
            els.append(Paragraph(f"Смета{(' № ' + esc(number)) if number else ''} от {dd.strftime('%d.%m.%Y')} · действительна до {(dd + timedelta(days=int(valid))).strftime('%d.%m.%Y')}", S["sub"]))
        els.append(Spacer(1, 8))
        info = [(k, v) for k, v in ([("Исполнитель", d.get("company"))] if is_act else []) + [("Заказчик", d.get("customer")), ("Адрес объекта", d.get("address"))] if v]
        if info:
            t = Table([[Paragraph(k, S["sub"]), Paragraph(esc(v), S["label"])] for k, v in info], colWidths=[32 * mm, W - 32 * mm])
            t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
            els += [t, Spacer(1, 10)]
        els += items_block(d, W)
        t = d.get("totals") or {}
        if is_act:
            els += [Spacer(1, 10), Paragraph(
                f"Вышеперечисленные работы выполнены полностью и в срок на общую сумму {money(t.get('total'))}. "
                "Заказчик претензий по объёму, качеству и срокам выполнения работ не имеет.", S["body"])]
        else:
            if d.get("paymentTerms"):
                els += [Paragraph("Условия оплаты", S["h2"]), Paragraph(esc(d.get("paymentTerms")), S["body"])]
            if d.get("notes"):
                els += [Paragraph("Примечания", S["h2"]), Paragraph(esc(d.get("notes")), S["body"])]
            if d.get("approvedAt"):
                ad = fmt_date(d.get("approvedAt"))
                els += [Spacer(1, 6), Paragraph(f"✓ Смета согласована заказчиком онлайн {ad.strftime('%d.%m.%Y') if ad else ''}", S["ok"])]
        els += [Spacer(1, 22), KeepTogether(sign_block(d, W, captions=("Работы сдал:", "Работы принял:") if is_act else None))]

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("DV", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 9 * mm, (d.get("company") or "") + (f" · {d.get('title')}" if d.get("title") else ""))
        canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, f"Стр. {doc_.page}")
        if d.get("freeMark"):
            canvas.setFillColor(GOLD)
            canvas.drawCentredString(A4[0] / 2, 5 * mm, "Составлено в СМЕТА PRO — сметы для строителей в Telegram")
        canvas.restoreState()

    doc.build(els, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


if __name__ == "__main__":
    data = json.load(sys.stdin)
    sys.stdout.buffer.write(build(data))
