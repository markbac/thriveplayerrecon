"""Club teams PDF: every team with its coaches and players, and whether each player is in the FA, in Thrive and
paying. Laid out on the WWFC document template: the app's club logo, the club name and the Accredited Club /
Lancashire FA badges in the header; the generated date and time and page number in the footer. Everything is
generated on this computer: nothing is sent anywhere.

The PDF holds names and ages only (no dates of birth, contacts or medical details) so it is the lightest
document the tool produces, but it still names children and must be handled as personal data."""
import os
import re
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
CONFIDENTIAL_ADULTS = ("CONFIDENTIAL: personal data about club officials. Share only with those who need it and "
                       "delete when finished.")


@dataclass
class TeamSummary:
    label: str
    staff: List[Tuple[str, str]] = field(default_factory=list)  # (role, name)
    players: List[List[str]] = field(default_factory=list)      # PDF_HEADERS values
    in_fa: int = 0
    in_thrive: int = 0
    paying: int = 0      # through Thrive or to the club directly
    not_paying: int = 0
    club_direct: int = 0  # of the paying, how many pay the club directly


@dataclass
class Official:
    """A person (or an unfilled role) from the club officials file or the managers file."""
    name: str                     # "" for a vacant role
    role: str = ""
    second_role: str = ""
    exec_member: bool = False
    teams: List[str] = field(default_factory=list)
    phone: str = ""
    fan: str = ""    # FAN ID, when the file has one (the updated officials file does)
    note: str = ""   # Notes column, when the file has one

    @property
    def roles(self) -> List[str]:
        return [r for r in (self.role, self.second_role) if r]


_AGE_ROLE = re.compile(r"^u0*(\d+)\s+(lead|head coach|manager|coach|assistant|asst)\b", re.I)


def _team_role(role: str) -> Optional[str]:
    """'manager' or 'assistant' for a team role (Manager, Assistant manager, Coach, 'U5 Lead'), else None."""
    r = role.lower()
    if any(w in r for w in ("assist", "asst", "deputy")):
        return "assistant"
    if "manager" in r or "coach" in r or re.search(r"\blead\b", r):
        return "manager"
    return None


def _yes(value: str) -> bool:
    return value.strip().lower() in ("yes", "y", "true", "x", "1", "\u2713", "\u2714")


def parse_officials(sheets) -> List[Official]:
    """People from a club officials file: Name, Role, and optionally Second role, Exec Member and Team(s). The
    existing one-row-per-person managers file has the same Name / Role / Team(s) columns, so it works too.
    Rows with a role but no name are kept as vacant roles. Returns [] for a one-row-per-team managers file."""
    for rows in sheets:
        for i, row in enumerate(rows[:15]):
            cols = {rc._hdr(c): j for j, c in enumerate(row) if rc._hdr(c)}
            name_i = rc._find_col(cols, ["name", "full name", "person", "staff"])
            role_i = rc._find_col(cols, ["role", "position", "job"])
            if name_i is None or role_i is None:
                continue
            second_i = rc._find_col(cols, ["second role", "other role", "additional role", "role 2", "also"])
            exec_i = rc._find_col(cols, ["exec member", "exec", "executive", "executive member", "committee",
                                         "exec committee", "committee member"])
            team_i = rc._find_col(cols, rc._TEAM_HEADERS)
            phone_i = rc._find_col(cols, ["phone", "mobile", "telephone", "tel", "phone number", "mobile number"])
            fan_i = rc._find_col(cols, ["fan", "fan id", "fan number"])
            note_i = rc._find_col(cols, ["notes", "note", "comments", "comment"])
            out = []
            for r in rows[i + 1:]:
                name, role = rc._cell(r, name_i), rc._cell(r, role_i)
                second = rc._cell(r, second_i) if second_i is not None else ""
                teams = rc._split_list(rc._cell(r, team_i)) if team_i is not None else []
                if not (name or role or second):
                    continue
                if name and not role and teams and not _team_role(second):
                    role = "Manager"  # as the managers file reads a person with a team but no role
                out.append(Official(name, role, second,
                                    _yes(rc._cell(r, exec_i)) if exec_i is not None else False, teams,
                                    rc._cell(r, phone_i) if phone_i is not None else "",
                                    rc._cell(r, fan_i) if fan_i is not None else "",
                                    rc._cell(r, note_i) if note_i is not None else ""))
            if out:
                return out
    return []


def load_officials(path: str) -> List[Official]:
    """parse_officials for a file on disk ([] when the file cannot be read)."""
    try:
        return parse_officials(rc._read_sheets(path))
    except rc.ReportError:
        return []


def officials_from_staff(result: rc.Result) -> List[Official]:
    """Managers and assistants from the managers file already attached to the result (any layout)."""
    seen = {}
    for label in rc.team_labels(result):
        for p in result.staff.get(label, []):
            o = seen.setdefault((p.name.lower(), p.role.lower()), Official(p.name, p.role, phone=p.phone))
            o.teams.append(label)
    return list(seen.values())


@dataclass
class OfficialsSummary:
    president: List[str] = field(default_factory=list)
    executive: List[Tuple[str, str, str]] = field(default_factory=list)  # (role, name or 'Vacant', also)
    teams: List[Tuple[str, List[str], List[str]]] = field(default_factory=list)  # (team, managers, assistants)
    others: List[Tuple[str, str]] = field(default_factory=list)  # (role, name)


_EXEC_ORDER = ("chair", "vice", "secretary", "treasurer", "welfare")


def _exec_key(role: str):
    r = role.lower()
    for i, word in enumerate(_EXEC_ORDER):
        if word in r and not (word == "chair" and "vice" in r):
            return (i, r)
    return (len(_EXEC_ORDER), r)


def _is_president(role: str) -> bool:
    r = role.lower()
    return "president" in r and "vice" not in r


def officials_summary(officials: List[Official]) -> OfficialsSummary:
    """The president, the executive committee, each team's managers and assistants, and anyone else."""
    out = OfficialsSummary()
    teams = {}  # team form -> [display name, managers, assistants]

    def add_team(team: str, kind: str, name: str) -> None:
        entry = teams.setdefault(rc._team_form(team, ""), [team, [], []])
        names = entry[1] if kind == "manager" else entry[2]
        if name not in names:
            names.append(name)

    for o in officials:
        club_roles = []
        for role in o.roles:
            age = _AGE_ROLE.match(role)
            if age:
                if o.name:
                    add_team(f"U{int(age.group(1))}", _team_role(role) or "manager", o.name)
            elif _team_role(role):
                if o.name:
                    for team in o.teams:
                        add_team(team, _team_role(role), o.name)
            else:
                club_roles.append(role)
        if o.name and any(_is_president(r) for r in club_roles):
            out.president.append(o.name)
            club_roles = [r for r in club_roles if not _is_president(r)]
        if not club_roles:
            continue
        also = ", ".join(r + (f" ({', '.join(o.teams)})" if _team_role(r) and not _AGE_ROLE.match(r) and o.teams
                              else "") for r in o.roles if r not in club_roles)
        entry = (" / ".join(club_roles), o.name or "Vacant", also)
        if o.exec_member:
            out.executive.append(entry)
        else:
            out.others.append(entry)
    out.executive.sort(key=lambda e: (e[1] == "Vacant", _exec_key(e[0])))
    out.others.sort(key=lambda e: e[0].lower())

    def team_key(form: str):
        limit = rc._team_age_limit(teams[form][0])
        return (limit if limit is not None else 999, form)
    out.teams = [(teams[f][0], teams[f][1], teams[f][2]) for f in sorted(teams, key=team_key)]
    return out


def officials_totals(officials: List[Official]) -> List[Tuple[str, int]]:
    """Counts for the summary page: people, executive roles (and how many are vacant), managers, assistants."""
    summary = officials_summary(officials)
    people = {o.name.strip().lower() for o in officials if o.name.strip()}
    managers = {n for _t, m, _a in summary.teams for n in m}
    assistants = {n for _t, _m, a in summary.teams for n in a}
    out = [("Club officials (people)", len(people))]
    if summary.executive:
        out.append(("Executive committee roles", len(summary.executive)))
        vacant = sum(1 for _r, n, _a in summary.executive if n == "Vacant")
        if vacant:
            out.append(("Executive committee roles vacant", vacant))
    out += [("Managers and team leads", len(managers)), ("Assistant managers", len(assistants))]
    return out


def _age_group_staff(officials: List[Official], label: str) -> List[Tuple[str, str]]:
    """Leads and assistants named by age group in the officials file ('U5 Lead') for a U4-U6 team."""
    limit = rc._team_age_limit(label)
    out = []
    for o in officials:
        for role in o.roles:
            m = _AGE_ROLE.match(role)
            if o.name and m and int(m.group(1)) == limit:
                out.append((role, o.name))
    return sorted(out, key=lambda e: _team_role(e[0]) != "manager")


def _with_fa_staff(staff: List[Tuple[str, str]], coaches, label: str) -> List[Tuple[str, str]]:
    """Merge the FA Team Qualifications Report into a team's staff: people only in the FA report are added with
    their FA role, marked '(FA report only)'; file staff the FA report does not have on this team are marked."""
    import coaches as co
    team = label.replace(" (Thrive)", "")
    if not co.covers_team(coaches, team):
        return staff
    fa = co.team_staff(coaches, team)
    out = []
    for role, name in staff:
        on_fa = any(co.same_person(name, n) for _r, n in fa)
        out.append((role, name if on_fa else f"{name} (not in the FA report)"))
    for role, name in fa:
        if not any(co.same_person(name, n) for _r, n in staff) and (role, f"{name} (FA report only)") not in out:
            out.append((role, f"{name} (FA report only)"))
    return out


def officials_with_fa(officials: List[Official], coaches) -> List[Official]:
    """The officials plus, for the officials page, the FA Team Qualifications Report's team roles they lack: people
    only in the FA report (marked) and FA teams missing for people in the file."""
    import coaches as co
    extra = []
    for c in coaches.coaches:
        match = next((o for o in officials if o.name and co.same_person(c.name, o.name)), None)
        for team, roles in c.team_roles.items():
            if match is not None and any(co.same_team(team, t) for t in match.teams):
                continue  # already on this team in the officials file
            name = match.name if match is not None else f"{c.name} (FA report only)"
            for role in roles or ["Team official"]:
                extra.append(Official(name, co.file_role(role), teams=[team]))
    return list(officials) + extra


def fa_cell(source: str, row: rc.Row) -> str:
    if source == rc.NO_FA:
        return "Not needed"
    if source == rc.FA_NOT_CHECKED:
        return "Not checked"
    if row.fa is None:
        return "No"
    return row.fa_status or "Yes"


CLUB_DIRECT = "Club direct"  # Paying cell for a player marked as paying the club directly


def paying_cell(row: rc.Row) -> str:
    if row.paid_outside == rc.PAID_DIRECT:
        return CLUB_DIRECT
    status = rc.paying_status(row)
    if status.startswith("Yes"):
        return "Yes"
    if status.startswith("No"):
        return "No"
    return "Unknown" if status.startswith("Unknown") else "Not expected"


def age_years_months(dob: date, today: date) -> str:
    """'4y 7m': age in whole years and months, used for the youngest groups (U4-U6)."""
    months = (today.year - dob.year) * 12 + today.month - dob.month - (today.day < dob.day)
    return f"{months // 12}y {months % 12}m"


def _surname_key(name: str):
    parts = name.split()
    return ((parts[-1] if parts else "").lower(), name.lower())


def club_summary(result: rc.Result, today: Optional[date] = None,
                 officials: Optional[List[Official]] = None, coaches=None) -> List[TeamSummary]:
    """One TeamSummary per team, in age-group order with training groups last, players sorted by surname."""
    today = today or date.today()
    teams = []
    labels = rc.team_labels(result)
    for label in sorted(labels, key=_is_training):  # stable: age order kept
        t = TeamSummary(label)
        people = result.staff.get(label, [])
        for kind, title in (("manager", "Manager"), ("assistant", "Assistant manager"), ("other", "Coach")):
            for p in people:
                if p.kind == kind and p.name.strip():
                    t.staff.append((p.role.strip() if kind == "other" and p.role.strip() else title, p.name.strip()))
        if officials and rc.no_fa_age_group(label):  # 'U5 Lead' and similar in the officials file
            named = {n for _r, n in t.staff}
            t.staff += [e for e in _age_group_staff(officials, label) if e[1] not in named]
        if coaches is not None:
            t.staff = _with_fa_staff(t.staff, coaches, label)
        for source, row in result.teams.get(label, []):
            name, dob, age = rc._name_dob(row, today)
            if dob and rc.no_fa_age_group(label):
                age = age_years_months(dob, today)
            fa, paying = fa_cell(source, row), paying_cell(row)
            t.players.append([name, str(age), fa, "Yes" if row.th else "No", paying])
            t.in_fa += row.fa is not None
            t.in_thrive += row.th is not None
            t.paying += paying in ("Yes", CLUB_DIRECT)
            t.club_direct += paying == CLUB_DIRECT
            t.not_paying += paying == "No"
        t.players.sort(key=lambda v: _surname_key(v[0]))
        teams.append(t)
    return teams


def _direct_note(t: TeamSummary) -> str:
    """' (2 to the club directly)' for the team page line, or nothing."""
    return f" ({t.club_direct} to the club directly)" if t.club_direct else ""


def _is_training(label: str) -> bool:
    return "training" in label.lower()


def club_totals(result: rc.Result) -> List[Tuple[str, int]]:
    """Club-wide counts with each player counted once, even when they play in two teams (Saturday and Sunday).
    The players split into U4 to U6, U7 and over in a team, and U7 and over in training groups only, which add up
    to the club total. Training groups are not teams: they do not count as a second team or as team places."""
    teams_of = {}  # id(row) -> (row, team labels)
    for label, members in result.teams.items():
        for _source, row in members:
            teams_of.setdefault(id(row), (row, set()))[1].add(label)
    rows = [row for row, _labels in teams_of.values()]
    paying = [paying_cell(r) for r in rows]
    groups = {"young": 0, "team": 0, "training": 0}
    for _r, labels in teams_of.values():
        if any(rc.no_fa_age_group(x) for x in labels):
            groups["young"] += 1
        elif any(not _is_training(x) for x in labels):
            groups["team"] += 1
        else:
            groups["training"] += 1
    out = [("Players in the club (each counted once)", len(rows)),
           ("Of these, U4 to U6", groups["young"]),
           ("Of these, U7 and over in a team", groups["team"]),
           ("Of these, U7 and over in training groups only", groups["training"]),
           ("Playing in two or more teams (e.g. Saturday and Sunday)",
            sum(1 for _r, labels in teams_of.values() if len([x for x in labels if not _is_training(x)]) > 1)),
           ("Team places (a player in two teams counts twice; training groups not counted)",
            sum(len(m) for label, m in result.teams.items() if not _is_training(label)))]
    if result.fa_checked:
        out.append(("In the FA report", sum(1 for r in rows if r.fa is not None)))
    out += [("In Thrive", sum(1 for r in rows if r.th is not None)),
            ("Paying through Thrive", paying.count("Yes")),
            ("Paying the club directly", paying.count(CLUB_DIRECT)),
            ("Not paying", paying.count("No"))]
    if paying.count("Unknown"):
        out.append(("Paying not known (no mandate column in the Thrive export)", paying.count("Unknown")))
    return out


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
        # so <b> and <i> in paragraphs pick the Calibri bold and italic files
        pdfmetrics.registerFontFamily("Calibri", normal="Calibri", bold="Calibri-Bold", italic="Calibri-Italic",
                                      boldItalic="Calibri-Bold")
        return "Calibri", "Calibri-Bold", "Calibri-Italic"
    except Exception:
        return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


GOOD, BAD, WARN, HEAD = "#E2F0D9", "#FFC7CE", "#FFF2CC", "#1F3A93"  # header blue picks up the club badge


def export_club_pdf(path: str, result: Optional[rc.Result], today: Optional[date] = None,
                    officials: Optional[List[Official]] = None, coaches=None) -> None:
    """Write the club PDF to path: the summary, club officials, coaches' qualifications (with the FA Team
    Qualifications Report) and a page per team (with the player files). result is None for a coaches-only run."""
    import coaches as co
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    BADGES_W = 2.05 * cm * 171 / 133  # fa_badges.png is 171 x 133
    from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                    TableStyle)
    from reportlab.pdfgen import canvas as pdfcanvas

    today = today or date.today()
    now = datetime.now()
    regular, bold, italic = _fonts()
    officials = officials or (officials_from_staff(result) if result is not None else [])
    teams = club_summary(result, today, officials, coaches) if result is not None else []
    margin = 2.54 * cm  # the template's 1 inch margins
    width, height = A4
    logo, badges = _asset("club_logo.png"), _asset("fa_badges.png")

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
            # the app's club logo left (pulled into the margin as in the template), FA badges right
            self.drawImage(logo, margin - 0.85 * cm, top - 1.95 * cm, 1.95 * cm, 1.95 * cm,
                           preserveAspectRatio=True, mask="auto")
            self.drawImage(badges, width - margin + 1.0 * cm - BADGES_W, top - 2.05 * cm, BADGES_W, 2.05 * cm,
                           preserveAspectRatio=True, anchor="e", mask="auto")
            x = margin + 1.3 * cm
            self.setFont(regular, 22)
            self.drawString(x, top - 0.75 * cm, CLUB_NAME)
            self.setFont(italic, 11)
            self.drawString(x, top - 1.3 * cm, CLUB_LINES[0])
            self.drawString(x, top - 1.8 * cm, CLUB_LINES[1])
            # footer: when it was generated, and the page number
            y = 1.25 * cm
            self.setFont(regular, 10)
            self.drawString(margin, y, f"Generated: {now:%d/%m/%Y %H:%M}")
            self.drawRightString(width - margin, y, f"Page {self._pageNumber} of {total}")

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

    def grid(rows, col_widths, header_rows=1, size=None):
        style = [("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#A6A6A6")),
                 ("BACKGROUND", (0, 0), (-1, header_rows - 1), colors.HexColor(HEAD)),
                 ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                 ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
        body_style, head_style = cell, cell_b
        if size:
            body_style = ParagraphStyle(f"cell{size}", parent=cell, fontSize=size, leading=size * 1.2)
            head_style = ParagraphStyle(f"cellb{size}", parent=cell_b, fontSize=size, leading=size * 1.2)
        data = [[Paragraph(esc(v), head_style if i < header_rows else body_style) for v in r]
                for i, r in enumerate(rows)]
        return Table(data, colWidths=col_widths, repeatRows=header_rows), style

    usable = width - 2 * margin
    if result is not None:
        story = [Paragraph(DOC_TITLE, h1),
                 Paragraph(f"Every team with its coaches and players, from the FA and Thrive exports, "
                           f"{today:%d %B %Y}.", body)]
        if not result.fa_checked:
            story.append(Paragraph("No FA report was loaded for this run, so FA registration was not checked.",
                                   body))
    else:
        story = [Paragraph("Club officials and coaches", h1),
                 Paragraph(f"From the FA Team Qualifications Report and the club officials file, "
                           f"{today:%d %B %Y}.", body)]
    # one summary table with a blue sub-heading per part
    sections = []
    if result is not None:
        sections.append(("Club summary", club_totals(result)))
    if officials:
        sections.append(("Club officials", officials_totals(officials)))
    if coaches is not None:
        sections.append(("Coaches (FA Team Qualifications Report)", co.coaches_totals(coaches, today)))
    summary_rows, subs = [], []
    for title, items in sections:
        subs.append(len(summary_rows))
        summary_rows += [[title, ""]] + [[name, str(n)] for name, n in items]
    if summary_rows:
        table, style = grid(summary_rows, [0.72 * usable, 0.14 * usable], header_rows=1)
        style += [("BACKGROUND", (1, 1), (1, -1), colors.HexColor("#F2F2F2"))]
        for sub in subs:
            style += [("SPAN", (0, sub), (1, sub)), ("BACKGROUND", (0, sub), (1, sub), colors.HexColor(HEAD))]
            table._cellvalues[sub][0] = Paragraph(esc(summary_rows[sub][0]), cell_b)
        table.setStyle(TableStyle(style))
        table.hAlign = "LEFT"
        story += [Spacer(0, 6), table, Spacer(0, 10)]
    if result is not None:
        story += [PageBreak(), Paragraph(f"Squads ({len(teams)})", h1), Spacer(0, 4)]
    rows = [["Squad", "Manager(s)", "Players", "In FA", "In Thrive", "Paying", "Not paying"]]
    for t in teams:
        managers = ", ".join(n for role, n in t.staff if _team_role(role) == "manager") or "-"
        rows.append([t.label, managers, len(t.players), t.in_fa if result.fa_checked else "-", t.in_thrive,
                     t.paying, t.not_paying])
    if result is not None:
        table, style = grid(rows, [x * usable for x in (0.22, 0.28, 0.1, 0.09, 0.11, 0.1, 0.1)])
        for i, t in enumerate(teams, 1):
            style.append(("BACKGROUND", (6, i), (6, i), colors.HexColor(BAD if t.not_paying else GOOD)))
            if i % 2 == 0:
                style.append(("BACKGROUND", (0, i), (5, i), colors.HexColor("#F2F2F2")))
        table.setStyle(TableStyle(style))
        story += [table, Spacer(0, 8), Paragraph(PDF_NOTE, small), Spacer(0, 4),
                  Paragraph(f'<font color="#C00000"><b>{esc(CONFIDENTIAL)}</b></font>', small)]
    else:
        story += [Paragraph(f'<font color="#C00000"><b>{esc(CONFIDENTIAL_ADULTS)}</b></font>', small)]

    if officials or coaches is not None:  # club officials page: president, executive, managers and assistants
        summary = officials_summary(officials_with_fa(officials, coaches) if coaches is not None else officials)
        story += [PageBreak(), Paragraph("Club officials", h1)]
        if summary.president:
            story += [Paragraph(f"<b>Club President:</b> {esc(', '.join(summary.president))}", body), Spacer(0, 8)]
        if summary.executive:
            story += [Paragraph("Executive committee", h2)]
            table, style = grid([["Role", "Name", "Also"]] + [list(e) for e in summary.executive],
                                [x * usable for x in (0.4, 0.25, 0.35)])
            for i, e in enumerate(summary.executive, 1):
                if e[1] == "Vacant":
                    style.append(("BACKGROUND", (1, i), (1, i), colors.HexColor(WARN)))
            table.setStyle(TableStyle(style))
            story += [table, Spacer(0, 8)]
        if summary.teams:
            story += [Paragraph("Managers and assistants", h2)]
            rows = [["Team", "Manager / lead", "Assistant(s)"]] + [
                [team, ", ".join(m) or "-", ", ".join(a) or "-"] for team, m, a in summary.teams]
            table, style = grid(rows, [x * usable for x in (0.26, 0.37, 0.37)])
            for i in range(2, len(rows), 2):
                style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F2F2F2")))
            table.setStyle(TableStyle(style))
            story += [table, Spacer(0, 4)]
            if coaches is not None:
                story += [Paragraph("(FA report only): in the FA Team Qualifications Report but not the officials "
                                    "file.", small)]
            story += [Spacer(0, 8)]
        if summary.others:
            story += [Paragraph("Other club roles", h2)]
            table, style = grid([["Role", "Name", "Also"]] + [list(e) for e in summary.others],
                                [x * usable for x in (0.4, 0.25, 0.35)])
            table.setStyle(TableStyle(style))
            story += [table]

    if coaches is not None:  # coaches' qualifications: what needs doing, then every coach
        window_colour = co.WINDOW_COLOURS
        story += [PageBreak(), Paragraph("Coaches' qualifications", h1),
                  Paragraph(f"From the FA Team Qualifications Report"
                            f"{' of ' + esc(coaches.report_date) if coaches.report_date else ''}. Expiry windows "
                            f"count from {today:%d/%m/%Y}.", body), Spacer(0, 6)]
        incomplete = [t.team for t in coaches.teams if t.complete.lower() == "incomplete"]
        if incomplete:
            story += [Paragraph("<b>Teams without a qualified coach/manager (FA: Incomplete):</b> "
                                + esc(", ".join(incomplete)), body), Spacer(0, 6)]
        lists = co.expiry_lists(coaches, today)
        due = [(w, *item) for w in (co.EXPIRED, co.NOT_HELD, co.M1, co.M3, co.M6) for item in lists[w]]
        story += [Paragraph("Expired, not held and expiring in the next 6 months", h2)]
        if due:
            table, style = grid([["When", "Coach", "Team(s)", "Certificate", "Expiry"]] + [list(d) for d in due],
                                [x * usable for x in (0.17, 0.22, 0.27, 0.16, 0.18)])
            for i, d in enumerate(due, 1):
                style.append(("BACKGROUND", (0, i), (0, i), colors.HexColor(window_colour[d[0]])))
            table.setStyle(TableStyle(style))
            story += [table, Spacer(0, 4)]
        else:
            story += [Paragraph("Nothing expired, missing or expiring within 6 months.", body)]
        def legend():
            """One row of coloured, labelled boxes explaining the colours."""
            bands = [co.EXPIRED, co.M1, co.M3, co.M6, co.OK, co.NOT_HELD]
            style_lg = ParagraphStyle("lg", parent=small, fontSize=8, leading=10, alignment=1)
            t = Table([[Paragraph(esc(b), style_lg) for b in bands]], colWidths=[usable / len(bands)] * len(bands))
            t.setStyle(TableStyle([("BACKGROUND", (i, 0), (i, 0), colors.HexColor(co.WINDOW_COLOURS[b]))
                                   for i, b in enumerate(bands)]
                                  + [("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#A6A6A6")),
                                     ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
            return t
        story += [legend(), Spacer(0, 4),
                  Paragraph("Not held is not always required: the FA requires First Aid only for some roles.",
                            small), Spacer(0, 8)]
        if coaches.officials_checked:
            not_in_file = [c for c in coaches.coaches if c.note == "Not in the officials file"]
            differs = [c for c in coaches.coaches if c.note and c.note != "Not in the officials file"]
            story += [Paragraph("Compared with the club officials file", h2)]
            items = []
            if not_in_file:
                items.append("<b>In the FA report but not the officials file:</b> "
                             + esc(", ".join(f"{c.name} ({', '.join(c.teams)})" for c in not_in_file)))
            if coaches.not_in_fa:
                items.append("<b>In the officials file with a team role but not the FA report:</b> "
                             + esc(", ".join(f"{n} ({t})" for n, _r, t in coaches.not_in_fa)))
            for c in differs:
                items.append(f"<b>{esc(c.name)}:</b> {esc(c.note)}")
            story += [Paragraph(x, body) for x in items] or [Paragraph("Everyone matches.", body)]
            story += [Spacer(0, 8)]
        story += [Paragraph(f"All coaches and team officials ({len(coaches.coaches)})", h2)]
        rows = [["Name", "Team(s)", "Role(s)", "Coaching qualification", "First Aid", "Safeguarding", "DBS"]]
        for c in coaches.coaches:
            rows.append([c.name, ", ".join(c.teams), ", ".join(c.roles), c.coaching or "None recorded"]
                        + [c.certs[k].text() for k, _n in co.CERTS])
        table, style = grid(rows, [x * usable for x in (0.17, 0.14, 0.13, 0.17, 0.13, 0.13, 0.13)], size=8.5)
        for i, c in enumerate(coaches.coaches, 1):
            for j, (k, _n) in enumerate(co.CERTS, 4):
                style.append(("BACKGROUND", (j, i), (j, i), colors.HexColor(window_colour[c.certs[k].window(today)])))
        table.setStyle(TableStyle(style))
        story += [table, Spacer(0, 4),
                  legend()]

    widths = [x * usable for x in (0.37, 0.11, 0.2, 0.14, 0.18)]
    for t in teams:
        story.append(PageBreak())
        head = [Paragraph(esc(t.label), h2)]
        head.append(Paragraph("<b>Coaches:</b>", body))
        for i, (role, name) in enumerate(t.staff):
            head.append(Paragraph(esc(f"{role}: {name}") + (";" if i < len(t.staff) - 1 else ""), body))
        if not t.staff:
            head.append(Paragraph("No coaches listed (add a managers file)", body))
        head.append(Paragraph(f"{len(t.players)} player{'' if len(t.players) == 1 else 's'}: {t.in_fa} in FA, {t.in_thrive} in Thrive, "
                              f"{t.paying} paying{_direct_note(t)}, {t.not_paying} not paying.", small))
        head.append(Spacer(0, 6))
        table, style = grid([PDF_HEADERS] + t.players, widths)
        for i, v in enumerate(t.players, 1):
            fa, thrive, paying = v[2], v[3], v[4]
            style.append(("BACKGROUND", (2, i), (2, i), colors.HexColor(
                BAD if fa == "No" else GOOD if fa.lower().startswith("registered") else WARN
                if fa not in ("Not needed", "Not checked") else "#FFFFFF")))
            style.append(("BACKGROUND", (3, i), (3, i), colors.HexColor(GOOD if thrive == "Yes" else BAD)))
            style.append(("BACKGROUND", (4, i), (4, i), colors.HexColor(
                GOOD if paying in ("Yes", CLUB_DIRECT) else BAD if paying == "No" else WARN if paying == "Unknown"
                else "#FFFFFF")))
        table.setStyle(TableStyle(style))
        story.append(KeepTogether(head))
        story.append(table if t.players else Paragraph("No players.", body))
    doc.build(story, canvasmaker=NumberedCanvas)
