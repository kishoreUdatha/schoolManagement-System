"""Income and expenditure as a spreadsheet (.xlsx) or a printable PDF.

The .xlsx is written directly (it is a zip of a few XML parts) so the books
need no spreadsheet library in the image; reportlab, already used for
certificates and admit cards, draws the PDF.
"""
import io
import zipfile
from datetime import date
from decimal import Decimal
from typing import Optional
from xml.sax.saxutils import escape

from sqlalchemy.orm import Session

from app.models.tenant import School
from app.models.user import User
from app.services import books_service

COLUMNS = ["#", "Code", "Account head", "Category", "Opening balance (₹)", "Debit (₹)", "Credit (₹)", "Closing balance (₹)"]


def _report(db: Session, user: User, frm, to, category, account_id) -> tuple[dict, str]:
    rep = books_service.profit_and_loss(db, user, frm, to, category=category, account_id=account_id)
    school = db.get(School, user.school_id)
    return rep, school.name if school else ""


def _lines(rep: dict) -> list[tuple[str, list]]:
    """(row kind, cells) in statement order: head, account, total, grand."""
    out: list[tuple[str, list]] = []
    n = 0
    for title, rows, tot, label in (
        ("INCOME", rep["income"], rep["income_totals"], "Total income"),
        ("EXPENDITURE", rep["expenses"], rep["expense_totals"], "Total expenditure"),
    ):
        out.append(("head", [title]))
        for r in rows:
            n += 1
            out.append(("row", [n, r["code"], r["name"], r["category"], r["opening"], r["debit"], r["credit"], r["closing"]]))
        out.append(("total", ["", "", label, "", tot["opening"], tot["debit"], tot["credit"], tot["closing"]]))
    it, et = rep["income_totals"], rep["expense_totals"]
    out.append(("grand", [
        "", "", "Surplus / (deficit)", "", rep["opening_surplus"],
        it["debit"] + et["debit"], it["credit"] + et["credit"], rep["closing_surplus"],
    ]))
    return out


def _title(rep: dict) -> str:
    return f"Income and expenditure account, {rep['from_date']:%d %b %Y} to {rep['to_date']:%d %b %Y}"


# ---------- xlsx ----------

_STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;(#,##0.00);&quot;-&quot;"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8F0FE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F7FE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFBFD4F7"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="10">
<xf/>
<xf fontId="2" applyFont="1"/>
<xf fontId="1" fillId="2" applyFont="1" applyFill="1"/>
<xf fontId="1" fillId="2" applyFont="1" applyFill="1"><alignment horizontal="right"/></xf>
<xf numFmtId="164" applyNumberFormat="1"/>
<xf fontId="1" fillId="3" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="1" fillId="3" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf fontId="1" fillId="4" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="1" fillId="4" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"""


def _col(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def _cell(ref: str, v, style: int) -> str:
    if isinstance(v, (int, float, Decimal)) and not isinstance(v, bool):
        return f'<c r="{ref}" s="{style}"><v>{v}</v></c>'
    if v in ("", None):
        return f'<c r="{ref}" s="{style}"/>'
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>'


def _xlsx(sheet_name: str, titles: list[str], header: list[str], lines: list[tuple[str, list]],
          widths: list[int], num_from: int) -> bytes:
    """One sheet: title lines, a header row, then statement lines (head,
    row, total, grand); columns from `num_from` on are amounts."""
    rows = []
    r = 1
    width = len(header)

    def add(cells: list[str]):
        nonlocal r
        rows.append(f'<row r="{r}">{"".join(cells)}</row>')
        r += 1

    for i, t in enumerate(titles):
        add([_cell(f"A{r}", t, 1 if i == 0 else 0)])
    add([])
    head_row = r
    add([_cell(f"{_col(i)}{r}", c, 3 if i >= num_from else 2) for i, c in enumerate(header)])
    for kind, cells in lines:
        if kind == "blank":
            add([])
            continue
        if kind == "head":
            add([_cell(f"{_col(i)}{r}", c, 6 if i >= num_from else 5) for i, c in enumerate(cells)]
                + [_cell(f"{_col(i)}{r}", "", 5) for i in range(len(cells), width)])
            continue
        text, num = {"row": (0, 4), "total": (5, 6), "grand": (7, 8)}[kind]
        add([_cell(f"{_col(i)}{r}", c, num if i >= num_from else text) for i, c in enumerate(cells)])

    cols = "".join(f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>' for i, w in enumerate(widths))
    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetViews><sheetView workbookViewId="0"><pane ySplit="{head_row}" topLeftCell="A{head_row + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f"<cols>{cols}</cols><sheetData>{''.join(rows)}</sheetData></worksheet>"
    )
    parts = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            "</Types>"
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        ),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets><sheet name="{escape(sheet_name[:31])}" sheetId="1" r:id="rId1"/></sheets></workbook>'
        ),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            "</Relationships>"
        ),
        "xl/styles.xml": _STYLES,
        "xl/worksheets/sheet1.xml": sheet,
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, body in parts.items():
            z.writestr(name, body)
    return buf.getvalue()


def income_expenditure_xlsx(
    db: Session, user: User, frm: Optional[date], to: Optional[date],
    category: Optional[str] = None, account_id: Optional[int] = None,
) -> tuple[bytes, str]:
    rep, school = _report(db, user, frm, to, category, account_id)
    body = _xlsx("Income and expenditure", [school, _title(rep)], COLUMNS, _lines(rep),
                 [5, 10, 34, 22, 20, 18, 18, 20], num_from=4)
    return body, f"income-expenditure_{rep['from_date']}_{rep['to_date']}.xlsx"


# ---------- pdf ----------


def inr(v, zero: str = "-") -> str:
    """12345678.5 -> "1,23,45,678.50"; negatives in brackets; zero as a dash."""
    n = Decimal(str(v or 0)).quantize(Decimal("0.01"))
    if not n:
        return zero
    whole, frac = f"{abs(n):.2f}".split(".")
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    s = ",".join(groups + [tail]) + "." + frac
    return f"({s})" if n < 0 else s


def income_expenditure_pdf(
    db: Session, user: User, frm: Optional[date], to: Optional[date],
    category: Optional[str] = None, account_id: Optional[int] = None,
) -> tuple[bytes, str]:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    rep, school = _report(db, user, frm, to, category, account_id)
    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=1.2 * cm, bottomMargin=1.2 * cm,
                            leftMargin=1.2 * cm, rightMargin=1.2 * cm, title=_title(rep))
    head = ["#", "Code", "Account head", "Category", "Opening (Rs)", "Debit (Rs)", "Credit (Rs)", "Closing (Rs)"]
    data = [head]
    style = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8F0FE")),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (4, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#DCE5F2")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for kind, cells in _lines(rep):
        i = len(data)
        if kind == "head":
            data.append([cells[0]] + [""] * 7)
            style += [("SPAN", (0, i), (-1, i)), ("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"),
                      ("TEXTCOLOR", (0, i), (-1, i), colors.HexColor("#1E3A8A"))]
            continue
        data.append([str(c) if j < 4 else inr(c) for j, c in enumerate(cells)])
        if kind == "total":
            style += [("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"),
                      ("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F3F7FE"))]
        elif kind == "grand":
            style += [("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"),
                      ("BACKGROUND", (0, i), (-1, i), colors.HexColor("#BFD4F7"))]
    table = Table(data, colWidths=[1 * cm, 1.8 * cm, 6.8 * cm, 4.2 * cm, 3.5 * cm, 3.3 * cm, 3.3 * cm, 3.5 * cm], repeatRows=1)
    table.setStyle(TableStyle(style))
    story = [
        Paragraph(f"<b>{escape(school)}</b>", styles["Title"]),
        Paragraph(escape(_title(rep)), styles["Normal"]),
        Spacer(1, 8),
        Paragraph(
            f"Income {inr(rep['total_income'], '0.00')} &nbsp;·&nbsp; Expenditure {inr(rep['total_expenses'], '0.00')} "
            f"&nbsp;·&nbsp; Surplus / (deficit) {inr(rep['surplus'], '0.00')}",
            styles["Normal"],
        ),
        Spacer(1, 10),
        table,
    ]
    doc.build(story)
    return buf.getvalue(), f"income-expenditure_{rep['from_date']}_{rep['to_date']}.pdf"


# ---------- balance sheet ----------


def _bs_lines(rep: dict) -> list[tuple[str, list]]:
    out: list[tuple[str, list]] = []
    for side, sections, total in (
        ("ASSETS", rep["asset_sections"], rep["total_assets"]),
        ("LIABILITIES AND FUNDS", rep["liability_sections"], rep["total_funds"]),
    ):
        out.append(("grand", [side, "", "", ""]))
        for sec in sections:
            out.append(("head", [sec["key"], sec["title"].upper(), "", sec["total"]]))
            for r in sec["rows"]:
                out.append(("row", [r["ref"], r["name"], r["schedule"] or "", r["amount"]]))
        out.append(("total", ["", f"Total {side.lower()}", "", total]))
        out.append(("blank", []))
    return out


def balance_sheet_xlsx(db: Session, user: User, as_of: Optional[date], account_id: Optional[int] = None) -> tuple[bytes, str]:
    rep = books_service.balance_sheet(db, user, as_of, account_id)
    school = db.get(School, user.school_id)
    body = _xlsx("Balance sheet", [school.name if school else "", f"Balance sheet as on {rep['as_of']:%d %b %Y}"],
                 ["Code", "Particulars", "Schedule", "Amount (₹)"], _bs_lines(rep), [8, 44, 10, 20], num_from=3)
    return body, f"balance-sheet_{rep['as_of']}.xlsx"


def balance_sheet_pdf(db: Session, user: User, as_of: Optional[date], account_id: Optional[int] = None) -> tuple[bytes, str]:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    rep = books_service.balance_sheet(db, user, as_of, account_id)
    school = db.get(School, user.school_id)
    name = school.name if school else ""
    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    title = f"Balance sheet as on {rep['as_of']:%d %b %Y}"
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=1.2 * cm, bottomMargin=1.2 * cm,
                            leftMargin=1.2 * cm, rightMargin=1.2 * cm, title=title)

    def side(label, sections, total, tint, ink):
        data = [[label, "", "", inr(total, "0.00")], ["Code", "Particulars", "Sch.", "Amount (Rs)"]]
        st = [
            ("SPAN", (0, 0), (2, 0)), ("FONTNAME", (0, 0), (-1, 1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 11), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(tint)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor(ink)),
            ("FONTSIZE", (0, 1), (-1, -1), 8.5), ("ALIGN", (2, 1), (-1, -1), "RIGHT"), ("ALIGN", (3, 0), (3, 0), "RIGHT"),
            ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#DCE5F2")),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        for sec in sections:
            i = len(data)
            data.append([sec["key"], sec["title"].upper(), "", inr(sec["total"], "0.00")])
            st += [("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"), ("TEXTCOLOR", (0, i), (-1, i), colors.HexColor(ink)),
                   ("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F5F8FD"))]
            for r in sec["rows"]:
                data.append([r["ref"], r["name"], str(r["schedule"] or ""), inr(r["amount"], "0.00")])
        i = len(data)
        data.append([f"TOTAL {label.upper()}", "", "", inr(total, "0.00")])
        st += [("SPAN", (0, i), (2, i)), ("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"),
               ("BACKGROUND", (0, i), (-1, i), colors.HexColor(tint)), ("TEXTCOLOR", (0, i), (-1, i), colors.HexColor(ink))]
        t = Table(data, colWidths=[1.2 * cm, 7.6 * cm, 1.3 * cm, 3.2 * cm], repeatRows=2)
        t.setStyle(TableStyle(st))
        return t

    pair = Table([[
        side("Assets", rep["asset_sections"], rep["total_assets"], "#E3EDFD", "#1E3A8A"),
        side("Liabilities and funds", rep["liability_sections"], rep["total_funds"], "#FDE4E4", "#9B1C1C"),
    ]], colWidths=[13.6 * cm, 13.6 * cm])
    pair.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    ratio = rep["current_ratio"]
    story = [
        Paragraph(f"<b>{escape(name)}</b>", styles["Title"]),
        Paragraph(escape(title), styles["Normal"]),
        Spacer(1, 6),
        Paragraph(
            f"Total assets {inr(rep['total_assets'], '0.00')} &nbsp;·&nbsp; Total liabilities {inr(rep['total_liabilities'], '0.00')} "
            f"&nbsp;·&nbsp; Net assets {inr(rep['net_assets'], '0.00')} &nbsp;·&nbsp; Current ratio {ratio if ratio is not None else '-'}",
            styles["Normal"],
        ),
        Spacer(1, 10),
        pair,
    ]
    doc.build(story)
    return buf.getvalue(), f"balance-sheet_{rep['as_of']}.pdf"
