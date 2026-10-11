#!/usr/bin/env python3
"""
Унифицированные формы КС-2 (акт о приёмке выполненных работ) и КС-3
(справка о стоимости выполненных работ и затрат) по образцу форм,
утверждённых постановлением Госкомстата России от 11.11.1999 № 100.
Читает JSON из stdin, пишет PDF (A4, альбомная) в stdout.
"""
import io
import json
import os
import sys
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

sys.path.insert(0, os.path.dirname(__file__))
from estimate_pdf import esc, money, qty, rub_words  # noqa: E402  (шрифты DejaVu регистрируются там)

INK = colors.HexColor("#111111")
GRID = colors.HexColor("#333333")


def st(name, **k):
    return ParagraphStyle(name, fontName=k.pop("f", "DV"), fontSize=k.pop("s", 7.5), leading=k.pop("l", 9), textColor=INK, **k)


T, TB, TR, TC = st("t"), st("tb", f="DV-B"), st("tr", alignment=TA_RIGHT), st("tc", alignment=TA_CENTER)
TCB = st("tcb", f="DV-B", alignment=TA_CENTER)
THB = st("thb", f="DV-B", s=6.5, l=8, alignment=TA_CENTER)
SMALL = st("sm", s=6, l=7, alignment=TA_CENTER)
TITLE = st("ti", f="DV-B", s=12, l=15, alignment=TA_CENTER)


def num(v):
    return money(v).replace(" ₽", "")


def dfmt(v):
    try:
        return datetime.fromisoformat(str(v)[:10]).strftime("%d.%m.%Y")
    except (TypeError, ValueError):
        return ""


def requisites_block(d, W, rows):
    """Шапка формы: стороны слева, коды справа (ОКУД, ОКПО — пустые клетки для заполнения)"""
    codes = Table([[Paragraph("Код", TCB)], [Paragraph(d["okud"], TC)]] + [[""] for _ in range(len(rows) - 1)],
                  colWidths=[26 * mm], rowHeights=[None] + [12] * len(rows))
    codes.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, GRID), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    body = []
    for label, value, hint in rows:
        body.append([Paragraph(label, T), Paragraph(f"<b>{esc(value)}</b>" if value else "", T), Paragraph(hint, st("h", s=6, alignment=TA_RIGHT))])
    left = Table(body, colWidths=[42 * mm, W - 42 * mm - 26 * mm - 34 * mm, 30 * mm], rowHeights=[12] * len(rows))
    left.setStyle(TableStyle([("LINEBELOW", (1, 0), (1, -1), 0.5, GRID), ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    outer = Table([[left, codes]], colWidths=[W - 30 * mm, 30 * mm])
    outer.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return outer


def form_head(d, W, form, title):
    top = Table([[Paragraph(f"Унифицированная форма № {form}<br/>Утверждена постановлением Госкомстата России<br/>от 11.11.99 № 100", st("u", s=6.5, alignment=TA_RIGHT))]], colWidths=[W])
    party_cust = ", ".join(x for x in [d.get("customer"), d.get("customerDetails")] if x)
    party_cont = ", ".join(x for x in [d.get("company"), (d.get("contacts") or "").replace("\n", ", ")] if x)
    rows = [
        ("Инвестор", d.get("investor") or "", "по ОКПО"),
        ("Заказчик (Генподрядчик)", party_cust, "по ОКПО"),
        ("Подрядчик (Субподрядчик)", party_cont, "по ОКПО"),
        ("Стройка", d.get("title") or "", ""),
        ("Объект", d.get("address") or "", "по ОКПО"),
    ]
    els = [top, Spacer(1, 2), requisites_block(d, W, rows), Spacer(1, 3)]
    contract = Table([[Paragraph("Договор подряда (контракт)", T), Paragraph("номер", TR), Paragraph(esc(d.get("contractNo") or ""), TC),
                       Paragraph("дата", TR), Paragraph(dfmt(d.get("contractDate")) or "", TC)]],
                     colWidths=[W - 96 * mm, 14 * mm, 30 * mm, 12 * mm, 40 * mm])
    contract.setStyle(TableStyle([("GRID", (2, 0), (2, 0), 0.6, GRID), ("GRID", (4, 0), (4, 0), 0.6, GRID), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    els += [contract, Spacer(1, 6)]
    docno = Table([[Paragraph("Номер документа", SMALL), Paragraph("Дата составления", SMALL), Paragraph("Отчётный период", SMALL), ""],
                   ["", "", Paragraph("с", SMALL), Paragraph("по", SMALL)],
                   [Paragraph(esc(d.get("number") or ""), TCB), Paragraph(dfmt(d.get("date")), TCB), Paragraph(dfmt(d.get("periodFrom")) or "", TC), Paragraph(dfmt(d.get("periodTo") or d.get("date")), TC)]],
                  colWidths=[28 * mm, 28 * mm, 26 * mm, 26 * mm])
    docno.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, GRID), ("SPAN", (2, 0), (3, 0)), ("SPAN", (0, 0), (0, 1)), ("SPAN", (1, 0), (1, 1)),
                               ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    head = Table([[Paragraph(title, TITLE), docno]], colWidths=[W - 112 * mm, 112 * mm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return els + [head, Spacer(1, 6)]


def signs(W, left, right):
    def col(who):
        return [Paragraph(f"<b>{who}</b>", T), Spacer(1, 10),
                Table([[Paragraph("", T), "", Paragraph("", T)], [Paragraph("(должность)", SMALL), Paragraph("(подпись)", SMALL), Paragraph("(расшифровка подписи)", SMALL)]],
                      colWidths=[38 * mm, 28 * mm, 44 * mm], style=[("LINEABOVE", (0, 1), (-1, 1), 0.5, GRID)]),
                Paragraph("М.П.", st("mp", s=7))]
    t = Table([[col(left), col(right)]], colWidths=[W / 2, W / 2])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return KeepTogether([Spacer(1, 12), t])


def ks2(d, W):
    els = form_head(d, W, "КС-2", "АКТ<br/>О ПРИЁМКЕ ВЫПОЛНЕННЫХ РАБОТ")
    els += [Paragraph(f"Сметная (договорная) стоимость в соответствии с договором подряда (субподряда): <b>{money(d.get('estimateTotal'))}</b>", T), Spacer(1, 5)]
    cw = [16 * mm, 18 * mm, None, 22 * mm, 20 * mm, 20 * mm, 28 * mm, 30 * mm]
    cw[2] = W - sum(c for c in cw if c)
    head = ["Номер по порядку", "Номер позиции по смете", "Наименование работ", "Номер единичной расценки", "Единица измерения",
            "Количество", "Цена за единицу, руб.", "Стоимость, руб."]
    rows = [[Paragraph(h, THB) for h in head], [Paragraph(str(i + 1), SMALL) for i in range(8)]]
    for i, it in enumerate(d.get("items") or []):
        rows.append([Paragraph(str(i + 1), TC), Paragraph(str(it.get("pos") or ""), TC), Paragraph(esc(it["name"]), T), Paragraph("", TC),
                     Paragraph(esc(it["unit"]), TC), Paragraph(qty(it["qty"]), TC), Paragraph(num(it["unitPrice"]), TR), Paragraph(num(it["amount"]), TR)])
    n = len(rows)
    tax_pct = float(d.get("taxPct") or 0)
    rows.append(["", "", Paragraph("<b>Итого</b>", TR), "", "", "", "", Paragraph(f"<b>{num(d.get('subtotal'))}</b>", TR)])
    rows.append(["", "", Paragraph(f"НДС {qty(tax_pct)}%" if tax_pct else "Без НДС", TR), "", "", "", "", Paragraph(num(d.get("tax")) if tax_pct else "—", TR)])
    rows.append(["", "", Paragraph("<b>Всего по акту</b>", TR), "", "", "", "", Paragraph(f"<b>{num(d.get('total'))}</b>", TR)])
    tb = Table(rows, colWidths=cw, repeatRows=2)
    tb.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, GRID), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("BACKGROUND", (0, 0), (-1, 1), colors.HexColor("#F0F0F0")),
                            ("SPAN", (2, n), (6, n)), ("SPAN", (2, n + 1), (6, n + 1)), ("SPAN", (2, n + 2), (6, n + 2)),
                            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    els += [tb, Spacer(1, 3), Paragraph(f"Сумма прописью: {rub_words(d.get('total'))}", st("w", s=7))]
    els.append(signs(W, "Сдал (Подрядчик)", "Принял (Заказчик)"))
    return els


def ks3(d, W):
    els = form_head(d, W, "КС-3", "СПРАВКА<br/>О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ")
    cw = [18 * mm, None, 16 * mm, 38 * mm, 38 * mm, 38 * mm]
    cw[1] = W - sum(c for c in cw if c)
    rows = [
        [Paragraph("Номер по порядку", THB), Paragraph("Наименование пусковых комплексов, этапов, объектов, видов выполненных работ, оборудования, затрат", TCB),
         Paragraph("Код", TCB), Paragraph("Стоимость выполненных работ и затрат, руб.", TCB), "", ""],
        ["", "", "", Paragraph("с начала проведения работ", TCB), Paragraph("с начала года", TCB), Paragraph("в том числе за отчётный период", TCB)],
        [Paragraph(str(i), SMALL) for i in range(1, 7)],
        ["", Paragraph("<b>Всего работ и затрат, включаемых в стоимость работ</b>", T), "",
         Paragraph(f"<b>{num(d['cum']['subtotal'])}</b>", TR), Paragraph(f"<b>{num(d['year']['subtotal'])}</b>", TR), Paragraph(f"<b>{num(d['period']['subtotal'])}</b>", TR)],
        ["", Paragraph("в том числе:", T), "", "", "", ""],
    ]
    for i, s in enumerate(d.get("sections") or []):
        rows.append([Paragraph(str(i + 1), TC), Paragraph(esc(s["name"]), T), "", Paragraph(num(s["cum"]), TR), Paragraph(num(s["year"]), TR), Paragraph(num(s["period"]), TR)])
    n = len(rows)
    tax_pct = float(d.get("taxPct") or 0)
    rows.append(["", Paragraph("<b>Итого</b>", TR), "", Paragraph(num(d["cum"]["subtotal"]), TR), Paragraph(num(d["year"]["subtotal"]), TR), Paragraph(f"<b>{num(d['period']['subtotal'])}</b>", TR)])
    rows.append(["", Paragraph(f"Сумма НДС {qty(tax_pct)}%" if tax_pct else "Без НДС", TR), "",
                 Paragraph(num(d["cum"]["tax"]) if tax_pct else "—", TR), Paragraph(num(d["year"]["tax"]) if tax_pct else "—", TR), Paragraph(num(d["period"]["tax"]) if tax_pct else "—", TR)])
    rows.append(["", Paragraph("<b>Всего с учётом НДС</b>" if tax_pct else "<b>Всего</b>", TR), "",
                 Paragraph(f"<b>{num(d['cum']['total'])}</b>", TR), Paragraph(f"<b>{num(d['year']['total'])}</b>", TR), Paragraph(f"<b>{num(d['period']['total'])}</b>", TR)])
    tb = Table(rows, colWidths=cw, repeatRows=3)
    tb.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, GRID), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("SPAN", (3, 0), (5, 0)), ("SPAN", (0, 0), (0, 1)), ("SPAN", (1, 0), (1, 1)), ("SPAN", (2, 0), (2, 1)),
                            ("BACKGROUND", (0, 0), (-1, 2), colors.HexColor("#F0F0F0")),
                            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    els += [tb, Spacer(1, 3), Paragraph(f"Сумма за отчётный период прописью: {rub_words(d['period']['total'])}", st("w", s=7))]
    els.append(signs(W, "Заказчик (Генподрядчик)", "Подрядчик (Субподрядчик)"))
    return els


def build(d):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=10 * mm, bottomMargin=12 * mm,
                            title="КС-2" if d.get("form") == "ks2" else "КС-3", author=d.get("company") or "")
    W = doc.width
    d["okud"] = "0322005" if d.get("form") == "ks2" else "0322001"
    els = ks2(d, W) if d.get("form") == "ks2" else ks3(d, W)

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("DV", 6.5)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawRightString(landscape(A4)[0] - 12 * mm, 6 * mm, f"Стр. {doc_.page}")
        canvas.restoreState()

    doc.build(els, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


if __name__ == "__main__":
    sys.stdout.buffer.write(build(json.load(sys.stdin)))
