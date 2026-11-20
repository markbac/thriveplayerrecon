"""Club teams PDF: every team with its coaches and players, and whether each player is in the FA, in Thrive and
paying. Laid out on the WWFC document template (club badge, name and Accredited Club logo in the header; issue,
page and date details in the footer). Everything is generated on this computer: nothing is sent anywhere.

The PDF holds names and ages only (no dates of birth, contacts or medical details) so it is the lightest
document the tool produces, but it still names children and must be handled as personal data."""
import os
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import List, Optional, Tuple

import reconcile_core as rc
from version import APP_TITLE, __version__

CLUB_NAME = "Wilpshire Wanderers Football Club"
CLUB_LINES = ("Established 1997", "Promoting a team Spirit")
DOC_TITLE = "Teams, coaches and players"
DOC_REF = "Team and player summary"
PDF_HEADERS = ["Player", "Age", "In FA", "In Thrive", "Paying"]
PDF_NOTE = ("In FA: the player's FA registration status, 'No' when not found in the FA report. Paying: whether the "
            "player has an active Thrive mandate. A player shown as not in Thrive may be there under a different "
            "name: check before chasing.")
CONFIDENTIAL = "CONFIDENTIAL: names children. Share only with those who need it and delete when finished."


@dataclass
class TeamSummary:
    label: str
    staff: List[Tuple[str, str]] = field(default_factory=list)  # (role, name)
    players: List[List[str]] = field(default_factory=list)      # PDF_HEADERS values
    in_fa: int = 0
    in_thrive: int = 0
    paying: int = 0
    not_paying: int = 0


def fa_cell(source: str, row: rc.Row) -> str:
    if source == rc.NO_FA:
        return "Not needed"
    if source == rc.FA_NOT_CHECKED:
        return "Not checked"
    if row.fa is None:
        return "No"
    return row.fa_status or "Yes"


def paying_cell(row: rc.Row) -> str:
    status = rc.paying_status(row)
    if status == "Yes":
        return "Yes"
    if status.startswith("No"):
        return "No"
    return "Unknown" if status.startswith("Unknown") else "Not expected"


def _surname_key(name: str):
    parts = name.split()
    return ((parts[-1] if parts else "").lower(), name.lower())


def club_summary(result: rc.Result, today: Optional[date] = None) -> List[TeamSummary]:
    """One TeamSummary per team, in age-group order, players sorted by surname."""
    today = today or date.today()
    teams = []
    for label in rc.team_labels(result):
        t = TeamSummary(label)
        people = result.staff.get(label, [])
        for kind, title in (("manager", "Manager"), ("assistant", "Assistant manager"), ("other", "Coach")):
            for p in people:
                if p.kind == kind and p.name.strip():
                    t.staff.append((p.role.strip() if kind == "other" and p.role.strip() else title, p.name.strip()))
        for source, row in result.teams.get(label, []):
            name, _dob, age = rc._name_dob(row, today)
            fa, paying = fa_cell(source, row), paying_cell(row)
            t.players.append([name, str(age), fa, "Yes" if row.th else "No", paying])
            t.in_fa += row.fa is not None
            t.in_thrive += row.th is not None
            t.paying += paying == "Yes"
            t.not_paying += paying == "No"
        t.players.sort(key=lambda v: _surname_key(v[0]))
        teams.append(t)
    return teams


# --------------------------------------------------------------------------- PDF drawing

def _asset(name: str) -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "assets", name)


def _fonts() -> Tuple[str, str, str]:
    """Calibri (as in the Word template) when Windows has it, otherwise the built-in Helvetica."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    fonts = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    wanted = {"Calibri": "calibri.ttf", "Calibri-Bold": "calibrib.ttf", "Calibri-Italic": "calibrii.ttf"}
    try:
        for name, file in wanted.items():
            if name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(name, os.path.join(fonts, file)))
        return "Calibri", "Calibri-Bold", "Calibri-Italic"
    except Exception:
        return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


GOOD, BAD, WARN, HEAD = "#E2F0D9", "#FFC7CE", "#FFF2CC", "#1F3A93"  # header blue picks up the club badge


def export_club_pdf(path: str, result: rc.Result, today: Optional[date] = None,
                    issue: str = "1.0") -> None:
    """Write the teams PDF to path."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                    TableStyle)
    from reportlab.pdfgen import canvas as pdfcanvas

    today = today or date.today()
    now = datetime.now()
    regular, bold, italic = _fonts()
    teams = club_summary(result, today)
    margin = 2.54 * cm  # the template's 1 inch margins
    width, height = A4
    badge, accredited = _asset("club_badge.jpg"), _asset("accredited_club.png")

    class NumberedCanvas(pdfcanvas.Canvas):
        """Draws the template header and footer once the page count ('Page x of y') is known."""

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            for state in self._pages:
                self.__dict__.update(state)
                self._chrome(len(self._pages))
                super().showPage()
            super().save()

        def _chrome(self, total: int) -> None:
            top = height - 1.25 * cm  # header distance 708 twips
            # club badge left (pulled into the margin as in the template), accredited logo right
            self.drawImage(badge, margin - 0.85 * cm, top - 1.9 * cm, 1.95 * cm, 1.84 * cm,
                           preserveAspectRatio=True, mask="auto")
            self.drawImage(accredited, margin + 13.7 * cm, top - 2.07 * cm, 3.94 * cm, 2.07 * cm,
                           preserveAspectRatio=True, mask="auto")
            x = margin + 1.3 * cm
            self.setFont(regular, 22)
            self.drawString(x, top - 0.75 * cm, CLUB_NAME)
            self.setFont(italic, 11)
            self.drawString(x, top - 1.3 * cm, CLUB_LINES[0])
            self.drawString(x, top - 1.8 * cm, CLUB_LINES[1])
            # footer: two lines in left / centre / right positions, like the template
            y1, y2 = 1.25 * cm + 0.5 * cm, 1.25 * cm
            self.setFont(regular, 11)
            self.drawString(margin, y1, f"Issue: {issue}")
            self.drawCentredString(width / 2, y1, f"Page: {self._pageNumber} of {total}")
            self.drawRightString(width - margin, y1, f"Issue Date: {today:%d/%m/%Y}")
            self.drawString(margin, y2, f"Doc: {DOC_REF}")
            self.drawRightString(width - margin, y2, f"Generated: {now:%d/%m/%Y %H:%M}")
            self.setFont(bold, 8)
            self.setFillColor(colors.HexColor("#C00000"))
            self.drawCentredString(width / 2, y2 - 0.5 * cm, CONFIDENTIAL)
            self.setFillColor(colors.black)

    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=margin, rightMargin=margin,
                            topMargin=margin + 1.3 * cm, bottomMargin=margin,
                            title=f"{CLUB_NAME}: {DOC_TITLE}", author=CLUB_NAME, subject=DOC_REF,
                            creator=f"{APP_TITLE} {__version__}")
    h1 = ParagraphStyle("h1", fontName=bold, fontSize=18, leading=22, spaceAfter=4,
                        textColor=colors.HexColor(HEAD))
    h2 = ParagraphStyle("h2", fontName=bold, fontSize=14, leading=18, spaceBefore=2, spaceAfter=2,
                        textColor=colors.HexColor(HEAD))
    body = ParagraphStyle("body", fontName=regular, fontSize=10.5, leading=13.5)
    small = ParagraphStyle("small", parent=body, fontSize=9, leading=11.5, textColor=colors.HexColor("#444444"))
    cell = ParagraphStyle("cell", parent=body, fontSize=10, leading=12)
    cell_b = ParagraphStyle("cellb", parent=cell, fontName=bold, textColor=colors.white)

    def esc(text: str) -> str:
        return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def grid(rows, col_widths, header_rows=1):
        style = [("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#A6A6A6")),
                 ("BACKGROUND", (0, 0), (-1, header_rows - 1), colors.HexColor(HEAD)),
                 ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                 ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
        data = [[Paragraph(esc(v), cell_b if i < header_rows else cell) for v in r] for i, r in enumerate(rows)]
        return Table(data, colWidths=col_widths, repeatRows=header_rows), style

    usable = width - 2 * margin
    story = [Paragraph(DOC_TITLE, h1),
             Paragraph(f"Every team with its coaches and players, from the FA and Thrive exports, "
                       f"{today:%d %B %Y}.", body)]
    if not result.fa_checked:
        story.append(Paragraph("No FA report was loaded for this run, so FA registration was not checked.", body))
    total = sum(len(t.players) for t in teams)
    story += [Spacer(0, 6),
              Paragraph(f"<b>{len(teams)}</b> teams, <b>{total}</b> player places, "
                        f"<b>{sum(t.paying for t in teams)}</b> paying through Thrive, "
                        f"<b>{sum(t.not_paying for t in teams)}</b> not paying.", body),
              Spacer(0, 8)]
    rows = [["Team", "Manager(s)", "Players", "In FA", "In Thrive", "Paying", "Not paying"]]
    for t in teams:
        managers = ", ".join(n for role, n in t.staff if role == "Manager") or "-"
        rows.append([t.label, managers, len(t.players), t.in_fa if result.fa_checked else "-", t.in_thrive,
                     t.paying, t.not_paying])
    table, style = grid(rows, [x * usable for x in (0.22, 0.28, 0.1, 0.09, 0.11, 0.1, 0.1)])
    for i, t in enumerate(teams, 1):
        style.append(("BACKGROUND", (6, i), (6, i), colors.HexColor(BAD if t.not_paying else GOOD)))
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (5, i), colors.HexColor("#F2F2F2")))
    table.setStyle(TableStyle(style))
    story += [table, Spacer(0, 8), Paragraph(PDF_NOTE, small)]
    if result.staff_issues:
        story += [Spacer(0, 6), Paragraph("<b>Managers file notes:</b> " + esc("; ".join(result.staff_issues)),
                                          small)]

    widths = [x * usable for x in (0.4, 0.08, 0.2, 0.14, 0.18)]
    for t in teams:
        story.append(PageBreak())
        head = [Paragraph(esc(t.label), h2)]
        staff = "; ".join(f"{role}: {name}" for role, name in t.staff) or "No coaches listed (add a managers file)"
        head.append(Paragraph(f"<b>Coaches</b>: {esc(staff)}", body))
        head.append(Paragraph(f"{len(t.players)} players: {t.in_fa} in FA, {t.in_thrive} in Thrive, "
                              f"{t.paying} paying, {t.not_paying} not paying.", small))
        head.append(Spacer(0, 6))
        table, style = grid([PDF_HEADERS] + t.players, widths)
        for i, v in enumerate(t.players, 1):
            fa, thrive, paying = v[2], v[3], v[4]
            style.append(("BACKGROUND", (2, i), (2, i), colors.HexColor(
                BAD if fa == "No" else GOOD if fa.lower().startswith("registered") else WARN
                if fa not in ("Not needed", "Not checked") else "#FFFFFF")))
            style.append(("BACKGROUND", (3, i), (3, i), colors.HexColor(GOOD if thrive == "Yes" else BAD)))
            style.append(("BACKGROUND", (4, i), (4, i), colors.HexColor(
                GOOD if paying == "Yes" else BAD if paying == "No" else WARN if paying == "Unknown" else "#FFFFFF")))
        table.setStyle(TableStyle(style))
        story.append(KeepTogether(head))
        story.append(table if t.players else Paragraph("No players.", body))
    doc.build(story, canvasmaker=NumberedCanvas)
