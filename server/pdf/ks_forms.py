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
    return ParagraphStyle(name, fontName=k.pop("f", "DV"), fontSize=k.pop("s", 7.5), leading=k.pop("l", 9), textColor=k.pop("textColor", INK), **k)


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


def ks6a(d, W):
    """КС-6а: журнал учёта выполненных работ — по позициям сметы, нарастающим итогом по актам"""
    els = form_head(d, W, "КС-6а", "ЖУРНАЛ<br/>УЧЁТА ВЫПОЛНЕННЫХ РАБОТ")
    acts = d.get("acts") or []
    nact = len(acts)
    fixed = [10 * mm, None, 14 * mm, 20 * mm, 18 * mm, 24 * mm]
    per = 30 * mm
    fixed[1] = max(50 * mm, W - sum(c for c in fixed if c) - per * nact - 30 * mm)
    cw = fixed + [per] * nact + [30 * mm]
    h1 = [Paragraph(x, THB) for x in ["№ п/п", "Наименование работ", "Ед. изм.", "Цена за единицу, руб.", "Кол-во по смете", "Сметная стоимость, руб."]]
    h1 += [Paragraph(f"Акт № {esc(a['number'])}<br/>{dfmt(a['date'])}", THB) for a in acts] + [Paragraph("Выполнено с начала работ", THB)]
    h2 = [""] * 6 + [Paragraph("кол-во / сумма", SMALL) for _ in acts] + [Paragraph("кол-во / сумма", SMALL)]
    rows = [h1, h2]
    for i, r in enumerate(d.get("rows") or []):
        cells = [Paragraph(str(i + 1), TC), Paragraph(esc(r["name"]), T), Paragraph(esc(r["unit"]), TC), Paragraph(num(r["price"]), TR),
                 Paragraph(qty(r["qty"]), TC), Paragraph(num(r["amount"]), TR)]
        for a in r["byAct"]:
            cells.append(Paragraph(f"{qty(a['qty'])}<br/>{num(a['amount'])}" if a["qty"] else "—", TC))
        cells.append(Paragraph(f"<b>{qty(r['doneQty'])}</b><br/>{num(r['doneAmount'])}", TC))
        rows.append(cells)
    tot = ["", Paragraph("<b>Итого</b>", TR), "", "", "", Paragraph(f"<b>{num(d.get('estimateSubtotal'))}</b>", TR)]
    tot += [Paragraph(f"<b>{num(a['subtotal'])}</b>", TC) for a in acts] + [Paragraph(f"<b>{num(d.get('doneSubtotal'))}</b>", TC)]
    rows.append(tot)
    tb = Table(rows, colWidths=cw, repeatRows=2)
    tb.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, GRID), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("BACKGROUND", (0, 0), (-1, 1), colors.HexColor("#F0F0F0")),
                            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    els += [tb, Spacer(1, 4), Paragraph("Суммы — без НДС, в ценах сметы (договора). Последние акты — справа.", st("n6", s=6.5))]
    els.append(signs(W, "Подрядчик", "Заказчик"))
    return els


P_T = st("pt", s=9, l=12)
P_TB = st("ptb", f="DV-B", s=9, l=12)
P_H = st("ph", s=6.5, l=8, alignment=TA_CENTER, textColor=colors.HexColor("#444444"))
P_TITLE = st("pti", f="DV-B", s=12.5, l=16, alignment=TA_CENTER)


def line_field(W, text, hint, h=16):
    """Заполненное значение над линией и подсказка под ней (как в бланке)"""
    t = Table([[Paragraph(text or "&nbsp;", P_T)], [Paragraph(hint, P_H)]], colWidths=[W], rowHeights=[None, 9])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (0, 0), 0.5, GRID), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return t


def aosr(d, W):
    """Акт освидетельствования скрытых работ — рекомендуемая форма (прил. 3 к приказу Минстроя России от 16.05.2023 № 344/пр)"""
    els = [Paragraph("Рекомендуемая форма (приложение № 3 к составу и порядку ведения исполнительной документации,<br/>утв. приказом Минстроя России от 16.05.2023 № 344/пр)", st("rf", s=6.5, alignment=TA_RIGHT)), Spacer(1, 6)]
    els.append(line_field(W, esc(", ".join(x for x in [d.get("title"), d.get("address")] if x)), "объект капитального строительства / объект (наименование, почтовый или строительный адрес)"))
    els.append(Spacer(1, 4))
    els.append(line_field(W, esc(", ".join(x for x in [d.get("customer"), d.get("customerDetails")] if x)), "застройщик, технический заказчик или заказчик (наименование / ФИО, реквизиты)"))
    els.append(Spacer(1, 4))
    els.append(line_field(W, esc(d.get("contractor") or ""), "лицо, осуществляющее строительство (подрядчик): наименование, ИНН, ОГРН / ОГРНИП, адрес"))
    els.append(Spacer(1, 4))
    els.append(line_field(W, "", "лицо, осуществляющее подготовку проектной документации (при наличии)"))
    els += [Spacer(1, 10), Paragraph(f"АКТ<br/>освидетельствования скрытых работ № {esc(d.get('number') or '____')}", P_TITLE), Spacer(1, 4)]
    dt = Table([[Paragraph(esc(d.get("place") or d.get("address") or ""), P_T), Paragraph(f"«{dfmt(d.get('date'))}»", st("dr", s=9, alignment=TA_RIGHT))]], colWidths=[W * 0.6, W * 0.4])
    els += [dt, Spacer(1, 8), Paragraph("<b>Представители:</b>", P_T), Spacer(1, 2)]
    for who in ["застройщика, технического заказчика или заказчика", "лица, осуществляющего строительство", "лица, осуществляющего строительство, по вопросам строительного контроля",
                "лица, осуществляющего подготовку проектной документации (при наличии)", "лица, выполнившего работы, подлежащие освидетельствованию"]:
        els.append(line_field(W, "", f"представитель {who}: должность, ФИО, документ о полномочиях"))
        els.append(Spacer(1, 3))
    els += [Spacer(1, 4), Paragraph("произвели осмотр работ, выполненных:", P_T), line_field(W, esc(d.get("contractor") or ""), "наименование лица, выполнившего работы"),
            Spacer(1, 4), Paragraph("и составили настоящий акт о нижеследующем:", P_T), Spacer(1, 4)]
    items = [
        ("1. К освидетельствованию предъявлены следующие работы:", d.get("work") or "", "наименование скрытых работ"),
        ("2. Работы выполнены по проектной документации:", d.get("project") or "", "номер, другие реквизиты чертежа, наименование проектной документации"),
        ("3. При выполнении работ применены:", d.get("materials") or "", "наименование строительных материалов (изделий) со ссылкой на сертификаты или другие документы"),
        ("4. Предъявлены документы, подтверждающие соответствие работ предъявляемым к ним требованиям:", d.get("evidence") or "фотофиксация, исполнительная схема", "исполнительные схемы, результаты испытаний и т. п."),
    ]
    for head, val, hint in items:
        els += [Paragraph(head, P_TB), line_field(W, esc(val), hint), Spacer(1, 4)]
    dates = Table([[Paragraph("5. Даты:", P_TB), Paragraph(f"начала работ «{dfmt(d.get('from')) or '____'}»", P_T), Paragraph(f"окончания работ «{dfmt(d.get('to')) or '____'}»", P_T)]], colWidths=[W * 0.2, W * 0.4, W * 0.4])
    els += [dates, Spacer(1, 4)]
    els += [Paragraph("6. Работы выполнены в соответствии с:", P_TB), line_field(W, esc(d.get("norms") or "проектной (рабочей) документацией, СП и технологическими картами"), "наименования и структурные единицы технических регламентов, иных нормативных правовых актов, разделы проектной документации"), Spacer(1, 4)]
    els += [Paragraph("7. Разрешается производство последующих работ:", P_TB), line_field(W, esc(d.get("next") or ""), "наименование работ, конструкций, участков сетей инженерно-технического обеспечения"), Spacer(1, 6)]
    els += [Paragraph("Дополнительные сведения: ________________________________________________", P_T), Spacer(1, 3),
            Paragraph("Акт составлен в ____ экземплярах. Приложения: ________________________________", P_T), Spacer(1, 10)]
    sig = [[Paragraph(f"Представитель {w}", P_T), "", ""] for w in ["заказчика", "лица, осуществляющего строительство", "по вопросам строительного контроля", "проектировщика (при наличии)", "лица, выполнившего работы"]]
    rows = []
    for r in sig:
        rows.append(r)
        rows.append([Paragraph("", P_H), Paragraph("(подпись)", P_H), Paragraph("(ФИО)", P_H)])
    t = Table(rows, colWidths=[W * 0.46, W * 0.22, W * 0.32])
    t.setStyle(TableStyle([("LINEBELOW", (1, i), (2, i), 0.5, GRID) for i in range(0, len(rows), 2)] + [("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 1)]))
    els += [KeepTogether([t])]
    return els


def invoice(d, W):
    """Счёт на оплату: банковский блок, поставщик, покупатель, позиции, итог прописью"""
    r = d.get("req") or {}
    B = st("ib", s=8.5, l=10.5)
    BB = st("ibb", f="DV-B", s=8.5, l=10.5)
    bank = Table([
        [Paragraph(esc(r.get("bank") or ""), B), Paragraph("БИК", B), Paragraph(esc(r.get("bik") or ""), B)],
        [Paragraph("Банк получателя", P_H), Paragraph("Сч. №", B), Paragraph(esc(r.get("ks") or ""), B)],
        [Paragraph(f"ИНН {esc(r.get('inn') or '')}" + (f"   КПП {esc(r.get('kpp'))}" if r.get("kpp") else ""), B), Paragraph("Сч. №", B), Paragraph(esc(r.get("rs") or ""), B)],
        [Paragraph(esc(r.get("name") or d.get("company") or ""), B), "", ""],
        [Paragraph("Получатель", P_H), "", ""],
    ], colWidths=[W * 0.58, W * 0.1, W * 0.32])
    bank.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, GRID), ("SPAN", (0, 0), (0, 1)), ("SPAN", (1, 2), (1, 4)), ("SPAN", (2, 2), (2, 4)), ("SPAN", (0, 3), (0, 4)),
                              ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 2)]))
    els = [bank, Spacer(1, 10), Paragraph(f"Счёт на оплату № {esc(d.get('number') or '')} от {dfmt(d.get('date'))}", st("it", f="DV-B", s=13, l=16)),
           Spacer(1, 2), Table([[""]], colWidths=[W], style=[("LINEABOVE", (0, 0), (-1, -1), 1.2, GRID)]), Spacer(1, 4)]
    sup = ", ".join(x for x in [r.get("name") or d.get("company"), f"ИНН {r['inn']}" if r.get("inn") else "", f"КПП {r['kpp']}" if r.get("kpp") else "",
                                 f"ОГРН {r['ogrn']}" if r.get("ogrn") else "", r.get("address") or ""] if x)
    parts = Table([[Paragraph("Поставщик<br/>(Исполнитель):", B), Paragraph(f"<b>{esc(sup)}</b>", B)],
                   [Paragraph("Покупатель<br/>(Заказчик):", B), Paragraph(f"<b>{esc(', '.join(x for x in [d.get('customer'), d.get('customerDetails')] if x))}</b>", B)],
                   [Paragraph("Основание:", B), Paragraph(esc(d.get("basis") or ""), B)]], colWidths=[W * 0.18, W * 0.82])
    parts.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    els += [parts, Spacer(1, 6)]
    cw = [10 * mm, None, 18 * mm, 14 * mm, 28 * mm, 30 * mm]
    cw[1] = W - sum(c for c in cw if c)
    rows = [[Paragraph(h, THB) for h in ["№", "Товары (работы, услуги)", "Кол-во", "Ед.", "Цена", "Сумма"]]]
    for i, it in enumerate(d.get("items") or []):
        rows.append([Paragraph(str(i + 1), TC), Paragraph(esc(it["name"]), T), Paragraph(qty(it["qty"]), TC), Paragraph(esc(it["unit"]), TC), Paragraph(num(it["price"]), TR), Paragraph(num(it["amount"]), TR)])
    tb = Table(rows, colWidths=cw)
    tb.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, GRID), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F0F0F0"))]))
    els.append(tb)
    tax_pct = float(d.get("taxPct") or 0)
    tot = [[Paragraph("<b>Итого:</b>", TR), Paragraph(f"<b>{num(d.get('subtotal'))}</b>", TR)],
           [Paragraph(f"В том числе НДС {qty(tax_pct)}%:" if d.get("vatIncluded") and tax_pct else ("НДС:" if tax_pct else "Без налога (НДС)"), TR), Paragraph(num(d.get("tax")) if tax_pct else "—", TR)],
           [Paragraph("<b>Всего к оплате:</b>", TR), Paragraph(f"<b>{num(d.get('total'))}</b>", TR)]]
    t2 = Table(tot, colWidths=[W - 30 * mm, 30 * mm])
    t2.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    els += [t2, Spacer(1, 4), Paragraph(f"Всего наименований {len(d.get('items') or [])}, на сумму {money(d.get('total'))}", B),
            Paragraph(f"<b>{rub_words(d.get('total'))}</b>", BB), Spacer(1, 4)]
    if d.get("note"):
        els.append(Paragraph(esc(d["note"]), st("nt", s=7.5)))
    els += [Spacer(1, 2), Table([[""]], colWidths=[W], style=[("LINEABOVE", (0, 0), (-1, -1), 1.2, GRID)]), Spacer(1, 18)]
    who = r.get("head") or ""
    is_ip = (r.get("name") or "").strip().upper().startswith("ИП") or len((r.get("inn") or "").strip()) == 12
    sig = Table([[Paragraph("<b>Индивидуальный предприниматель</b>" if is_ip else "<b>Руководитель</b>", B), "", Paragraph(esc(who), B)],
                 ["", Paragraph("(подпись)", P_H), Paragraph("(расшифровка)", P_H)]] + ([] if is_ip else [
                 [Paragraph("<b>Бухгалтер</b>", B), "", Paragraph(esc(who), B)], ["", Paragraph("(подпись)", P_H), Paragraph("(расшифровка)", P_H)]]),
                colWidths=[W * 0.35, W * 0.3, W * 0.35])
    sig.setStyle(TableStyle([("LINEBELOW", (1, 0), (2, 0), 0.5, GRID)] + ([] if is_ip else [("LINEBELOW", (1, 2), (2, 2), 0.5, GRID)]) + [("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
    els.append(KeepTogether([sig]))
    if d.get("signPath") and os.path.exists(d["signPath"]):
        from reportlab.platypus import Image as RLImage
        try:
            els.append(RLImage(d["signPath"], width=40 * mm, height=20 * mm, kind="proportional"))
        except Exception:  # noqa: BLE001
            pass
    return els


def build(d):
    buf = io.BytesIO()
    form = d.get("form")
    portrait = form in ("aosr", "invoice")
    size = A4 if portrait else landscape(A4)
    titles = {"ks2": "КС-2", "ks3": "КС-3", "ks6a": "КС-6а", "aosr": "Акт освидетельствования скрытых работ", "invoice": "Счёт на оплату"}
    doc = SimpleDocTemplate(buf, pagesize=size, leftMargin=(18 if portrait else 12) * mm, rightMargin=(12 if portrait else 12) * mm, topMargin=10 * mm, bottomMargin=12 * mm,
                            title=titles.get(form, "Документ"), author=d.get("company") or "")
    W = doc.width
    d["okud"] = {"ks2": "0322005", "ks3": "0322001", "ks6a": "0322006"}.get(form, "")
    els = {"ks2": ks2, "ks3": ks3, "ks6a": ks6a, "aosr": aosr, "invoice": invoice}[form](d, W)

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("DV", 6.5)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawRightString(size[0] - 12 * mm, 6 * mm, f"Стр. {doc_.page}")
        canvas.restoreState()

    doc.build(els, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


if __name__ == "__main__":
    sys.stdout.buffer.write(build(json.load(sys.stdin)))
