"""Coaches reconciliation from the FA Team Qualifications Report (Whole Game System, Reports > Team
Qualifications Report): each team official's teams, roles, highest coaching qualification and First Aid,
Safeguarding Children and DBS expiry, with expiry windows (expired or not held, within 1, 3 and 6 months) and a
comparison with the club's managers / club officials file.

Kept apart from reconcile_core so the player reconciliation (and its parity tests with the web app) is unchanged.
web/src/coaches.ts mirrors this module. Everything runs on this computer: nothing is sent anywhere."""
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

import reconcile_core as rc

QUAL_HEADERS = ["fan", "name", "first aid expiry", "safeguarding children expiry", "dbs expiry"]
CERTS = [("first_aid", "First Aid"), ("safeguarding", "Safeguarding"), ("dbs", "DBS")]
QUAL_HOW_TO = ("To get the FA Team Qualifications Report: in the Whole Game System (https://wgs.thefa.com/) go "
               "to Reports, choose Team Qualifications Report and export it to Excel.")

# expiry windows, in the order they are shown
EXPIRED, NOT_HELD, M1, M3, M6, OK, UNKNOWN = ("Expired", "Not held", "Within 1 month", "1 to 3 months",
                                              "3 to 6 months", "6 months or more", "Unknown")
# colour for each band, used by the apps and the PDF: red, light red, orange, yellow, green; grey for not held
WINDOW_COLOURS = {EXPIRED: "#F4A3A3", M1: "#FFC7CE", M3: "#F8CBAD", M6: "#FFF2CC", OK: "#E2F0D9",
                  NOT_HELD: "#D9D9D9", UNKNOWN: "#FFFFFF"}
WINDOW_ORDER = [EXPIRED, NOT_HELD, M1, M3, M6, OK, UNKNOWN]
WINDOWS = [(1, M1), (3, M3), (6, M6)]

# extra short forms for adults' names (the player matcher already handles Chris/Christopher by prefix)
_COACH_NICKNAMES = {"rick": "richard", "ricky": "richard", "rich": "richard", "dick": "richard",
                    "jamie": "james", "jim": "james", "andy": "andrew", "drew": "andrew", "tony": "anthony",
                    "mike": "michael", "mick": "michael", "nick": "nicholas", "jon": "jonathan",
                    "jonny": "jonathan", "jonathon": "jonathan", "kate": "katherine", "katie": "katherine",
                    "bill": "william", "liz": "elizabeth", "beth": "elizabeth", "sue": "susan", "pete": "peter",
                    "ste": "stephen", "steve": "stephen", "steven": "stephen", "stuart": "stewart",
                    "geoff": "geoffrey", "dave": "david", "davey": "david", "ged": "gerard", "gaz": "gary", "baz": "barry", "al": "alan"}


@dataclass
class Cert:
    status: str               # "valid", "expiring", "expired", "not held" or "unknown"
    expiry: Optional[date] = None
    raw: str = ""

    def window(self, today: date) -> str:
        """Expired, Not held, Within 1 month, 1 to 3 months, 3 to 6 months, OK or Unknown."""
        if self.status == "expired":
            return EXPIRED
        if self.status == "not held":
            return NOT_HELD
        if self.expiry is None:
            return UNKNOWN
        if self.expiry < today:
            return EXPIRED
        for months, name in WINDOWS:
            if self.expiry <= add_months(today, months):
                return name
        return OK

    def text(self) -> str:
        if self.expiry:
            return self.expiry.strftime("%d/%m/%Y")
        return {"expired": "Expired", "not held": "Not held"}.get(self.status, self.raw or "-")


@dataclass
class Coach:
    fan: str
    name: str
    teams: List[str] = field(default_factory=list)   # short team names, e.g. "U8 Blue"
    roles: List[str] = field(default_factory=list)   # "Team Coach", "Assistant Team Coach", ...
    coaching: str = ""                               # highest coaching qualification
    certs: Dict[str, Cert] = field(default_factory=dict)
    official: str = ""      # matching name in the managers / club officials file
    note: str = ""          # reconciliation note against that file
    phone: str = ""         # from that file, for the WhatsApp reminder


@dataclass
class TeamQual:
    team: str               # short name
    age: str
    complete: str           # "Complete" / "Incomplete" (youth team with qualified coach/manager)
    adult_first_aid: str = ""


@dataclass
class CoachesResult:
    coaches: List[Coach]
    teams: List[TeamQual]
    report_date: str = ""
    not_in_fa: List[Tuple[str, str, str]] = field(default_factory=list)  # (name, role, teams) from the file
    officials_checked: bool = False


def add_months(d: date, months: int) -> date:
    """The same day `months` later (the last day of the month when that day does not exist)."""
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    return date(year, month, 28)


def _to_date(value) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(value or ""))
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def parse_cert(value) -> Cert:
    """'21/01/2028', 'Expiring (01/02/2027)', 'Expired', 'Not Held' or blank."""
    raw = rc._s(value) if not isinstance(value, (date, datetime)) else ""
    low = raw.lower()
    if low.startswith("expired"):
        return Cert("expired", _to_date(raw), raw)
    if "not held" in low or low in ("none", "n/a", "no"):
        return Cert("not held", None, raw)
    d = _to_date(value)
    if d:
        return Cert("expiring" if low.startswith("expiring") else "valid", d, raw)
    return Cert("unknown" if raw else "not held", None, raw)


def is_qualifications_report(sheets) -> bool:
    for rows in sheets:
        for row in rows[:40]:
            cells = [rc._hdr(c) for c in row]
            if all(h in cells for h in QUAL_HEADERS):
                return True
    return False


def _short_team(team: str) -> str:
    """'Wilpshire Wanderers U8 Blue' -> 'U8 Blue' (the club name is dropped from the start)."""
    m = re.search(r"\bu\d+\b.*", team, re.I)
    return m.group(0).strip() if m else team.strip()


def parse_qualifications(sheets, today: Optional[date] = None) -> CoachesResult:
    """Read the FA Team Qualifications Report. Team Age, Team Name and the team columns are merged over each
    team's rows, so they are carried down. A person on several teams is one Coach with all their teams."""
    for rows in sheets:
        for i, row in enumerate(rows[:40]):
            cols = {rc._hdr(c): j for j, c in enumerate(row) if rc._hdr(c)}
            if not all(h in cols for h in QUAL_HEADERS):
                continue
            age_i = rc._find_col(cols, ["team age"])
            team_i = rc._find_col(cols, ["team name", "team"])
            role_i = rc._find_col(cols, ["team roles", "team role", "role"])
            coach_i = rc._find_col(cols, ["highest coaching qualification", "coaching qualification"])
            youth_i = next((j for h, j in cols.items() if h.startswith("youth team")), None)
            adult_i = next((j for h, j in cols.items() if h.startswith("adult team")), None)
            date_text = ""
            for r in rows[:i]:
                if rc._hdr(r[0] if r else "") in ("date & time:", "date and time:", "date & time"):
                    date_text = rc._cell(r, 1)
            coaches: Dict[str, Coach] = {}
            teams: Dict[str, TeamQual] = {}
            age = team = ""
            for r in rows[i + 1:]:
                if not any(rc._s(c) for c in r):
                    if coaches:
                        break  # the definitions below the table
                    continue
                age = rc._cell(r, age_i) or age
                if rc._cell(r, team_i):
                    team = _short_team(rc._cell(r, team_i))
                    teams.setdefault(team, TeamQual(team, age, rc._cell(r, youth_i), rc._cell(r, adult_i)))
                fan, name = rc._cell(r, cols["fan"]), rc._cell(r, cols["name"])
                if not name:
                    continue
                key = fan or name.lower()
                c = coaches.get(key)
                if c is None:
                    c = coaches[key] = Coach(fan, name, coaching=rc._cell(r, coach_i))
                    c.certs = {"first_aid": parse_cert(r[cols["first aid expiry"]]),
                               "safeguarding": parse_cert(r[cols["safeguarding children expiry"]]),
                               "dbs": parse_cert(r[cols["dbs expiry"]])}
                if team and team not in c.teams:
                    c.teams.append(team)
                role = rc._cell(r, role_i)
                if role and role not in c.roles:
                    c.roles.append(role)
                c.coaching = c.coaching or rc._cell(r, coach_i)
            if coaches:
                return CoachesResult(sorted(coaches.values(), key=lambda c: _surname(c.name)),
                                     sorted(teams.values(), key=lambda t: _team_key(t.team)), date_text)
    raise rc.ReportError("This does not look like the FA Team Qualifications Report (expected FAN, Name, First "
                         "Aid Expiry, Safeguarding Children Expiry and DBS Expiry columns). " + QUAL_HOW_TO)


def load_qualifications(path: str) -> CoachesResult:
    return parse_qualifications(rc._read_sheets(path))


def detect_qualifications(path: str) -> bool:
    try:
        return is_qualifications_report(rc._read_sheets(path))
    except Exception:
        return False


def _surname(name: str):
    parts = name.split()
    return ((parts[-1] if parts else "").lower(), name.lower())


def _team_key(team: str):
    limit = rc._team_age_limit(team)
    return (limit if limit is not None else 999, team.lower())


def _first(name: str) -> str:
    s = rc.squash(name)
    return _COACH_NICKNAMES.get(s, s)


def same_person(a: str, b: str, fuzzy: float = rc.DEFAULT_FUZZY) -> bool:
    """'Chris Nestor' and 'Christopher Nestor', 'Rick Worden' and 'Richard Worden', 'Emily sewell' and
    'Emily Sewell' are the same person. Both first and last names must agree."""
    pa, pb = a.split(), b.split()
    if len(pa) < 2 or len(pb) < 2:
        return rc.squash(a) == rc.squash(b) and bool(rc.squash(a))
    if not rc._name_score(pa[-1], pb[-1], True, fuzzy):
        return False
    fa, fb = _first(pa[0]), _first(pb[0])
    return fa == fb or rc._name_score(fa, fb, False, fuzzy) > 0 or rc._name_score(pa[0], pb[0], False, fuzzy) > 0


def same_team(a: str, b: str) -> bool:
    """'U8 White Sunday' and 'U8 White' are the same team; 'U08 Blue' and 'U8 Blue' too."""
    fa, fb = rc._team_form(a, ""), rc._team_form(b, "")
    return fa == fb or fa.startswith(fb + " ") or fb.startswith(fa + " ")


def _team_role(role: str) -> bool:
    r = role.lower()
    return any(w in r for w in ("manager", "coach", "assist", "asst", "lead")) and not re.match(r"^u0*\d+\s", r)


def reconcile_coaches(result: CoachesResult, officials) -> CoachesResult:
    """Compare with the managers / club officials file (club_pdf.Official list): who is in the FA report but not
    the file, who has a team role in the file but is not in the FA report, and team differences."""
    result.officials_checked = bool(officials)
    result.not_in_fa = []
    if not officials:
        return result
    people = [o for o in officials if o.name]
    for c in result.coaches:
        match = next((o for o in people if same_person(c.name, o.name)), None)
        if match is None:
            c.official, c.note = "", "Not in the officials file"
            continue
        c.official, c.phone = match.name, match.phone
        notes = []
        missing = [t for t in match.teams if not any(same_team(t, x) for x in c.teams)]
        extra = [t for t in c.teams if not any(same_team(t, x) for x in match.teams)]
        if missing:
            notes.append("Not on " + ", ".join(missing) + " in the FA report")
        if extra and match.teams:
            notes.append("Not listed for " + ", ".join(extra) + " in the officials file")
        c.note = "; ".join(notes)
    for o in people:
        roles = [r for r in o.roles if _team_role(r)]
        if roles and o.teams and not any(same_person(c.name, o.name) for c in result.coaches):
            result.not_in_fa.append((o.name, ", ".join(roles), ", ".join(o.teams)))
    return result


# --------------------------------------------------------------------------- WhatsApp reminder

REMINDER_BANDS = (EXPIRED, NOT_HELD, M1, M3, M6)
# what the coach needs to do: placeholder text for the sender to fill in before sending
TO_DO = {"first_aid": "[What to do: e.g. book the FA Introduction to First Aid in Football course - add the "
                      "link or date]",
         "safeguarding": "[What to do: e.g. complete the FA Safeguarding Children course online - add the link]",
         "dbs": "[What to do: e.g. start your FA DBS renewal - add who to contact or the link]"}


def needs_reminder(c: Coach, today: date) -> bool:
    """True when First Aid, Safeguarding or DBS has expired, is not held or expires within 6 months."""
    return any(c.certs[k].window(today) in REMINDER_BANDS for k, _n in CERTS)


def reminder_message(c: Coach, today: Optional[date] = None, club: str = "Wilpshire Wanderers FC") -> str:
    """WhatsApp text for a coach: what has expired or is expiring, then placeholder steps to fill in."""
    today = today or date.today()
    due = sorted(((k, label, c.certs[k].window(today)) for k, label in CERTS
                  if c.certs[k].window(today) in REMINDER_BANDS), key=lambda x: REMINDER_BANDS.index(x[2]))
    first = c.name.split()[0] if c.name.split() else c.name
    teams = f" ({', '.join(c.teams)})" if c.teams else ""
    lines = [f"Hi {first}, this is a reminder from {club} about your FA team official qualifications{teams}.", ""]
    for key, label, band in due:
        if band == EXPIRED:
            lines.append(f"- {label}: expired")
        elif band == NOT_HELD:
            lines.append(f"- {label}: not on your FA record")
        else:
            lines.append(f"- {label}: expires {c.certs[key].text()} ({band.lower()})")
    lines += ["", "What you need to do:"]
    lines += [f"- {label}: {TO_DO[key]}" for key, label, _b in due]
    lines += ["", "Please let me know once it is done. Thank you!"]
    return "\n".join(lines)


# --------------------------------------------------------------------------- views

COACH_HEADERS = ["Name", "Team(s)", "Role(s)", "Coaching qualification", "First Aid", "Safeguarding", "DBS",
                 "Next action", "Officials file"]

FILTERS = ["All coaches", "Expired or not held", "Expires within 1 month", "Expires in 1 to 3 months",
           "Expires in 3 to 6 months", "Expires in 6 months or more", "Not in the officials file"]
_FILTER_WINDOWS = {FILTERS[1]: (EXPIRED, NOT_HELD), FILTERS[2]: (M1,), FILTERS[3]: (M3,), FILTERS[4]: (M6,)}


def next_action(c: Coach, today: date) -> Tuple[str, str]:
    """('DBS expired', band) for the most urgent of the three, or ('', OK) when all run 6 months or more."""
    order = [EXPIRED, NOT_HELD, M1, M3, M6]
    best = None
    for key, label in CERTS:
        w = c.certs[key].window(today)
        if w in order and (best is None or order.index(w) < order.index(best[1])):
            best = (label, w)
    if best is None:
        return "", OK
    label, w = best
    if w == EXPIRED:
        return f"{label} expired", w
    if w == NOT_HELD:
        return f"{label} not held", w
    return f"{label} expires {c.certs[[k for k, n in CERTS if n == label][0]].text()} ({w.lower()})", w


def coach_matches(c: Coach, filt: str, today: date) -> bool:
    """A coach is in a band when any of their three certificates is in it; '6 months or more' means all three."""
    windows = [c.certs[k].window(today) for k, _n in CERTS]
    if filt in _FILTER_WINDOWS:
        return any(w in _FILTER_WINDOWS[filt] for w in windows)
    if filt == FILTERS[5]:
        return all(w == OK for w in windows)
    if filt.startswith("Not in"):
        return c.note == "Not in the officials file"
    return True


def coach_rows(result: CoachesResult, filt: str = FILTERS[0], today: Optional[date] = None):
    """(headers, [(values, band)]) where band is the coach's most urgent band (see WINDOW_COLOURS)."""
    today = today or date.today()
    rows = []
    for c in result.coaches:
        if not coach_matches(c, filt, today):
            continue
        action, band = next_action(c, today)
        official = (c.official or "No") if result.officials_checked else ""
        if result.officials_checked and c.note and c.note != "Not in the officials file":
            official = f"{c.official}: {c.note}"
        rows.append(([c.name, ", ".join(c.teams), ", ".join(c.roles), c.coaching or "None recorded",
                      *(cert_cell(c.certs[k], today) for k, _n in CERTS), action or "None", official], band))
    return COACH_HEADERS, rows


def cert_cell(cert: Cert, today: date) -> str:
    w = cert.window(today)
    text = cert.text()
    return text if w in (EXPIRED, NOT_HELD, UNKNOWN) else f"{text} ({w.lower()})"


def expiry_lists(result: CoachesResult, today: Optional[date] = None) -> Dict[str, List[Tuple[str, str, str, str]]]:
    """Window -> [(coach, teams, certificate, expiry text)] for Expired, Not held and each expiry window."""
    today = today or date.today()
    out: Dict[str, List[Tuple[str, str, str, str]]] = {w: [] for w in (EXPIRED, NOT_HELD, M1, M3, M6)}
    for c in result.coaches:
        for key, label in CERTS:
            w = c.certs[key].window(today)
            if w in out:
                out[w].append((c.name, ", ".join(c.teams), label, c.certs[key].text()))
    return out


def coaches_totals(result: CoachesResult, today: Optional[date] = None) -> List[Tuple[str, int]]:
    today = today or date.today()
    lists = expiry_lists(result, today)
    def people(*windows):
        return len({name for w in windows for name, *_rest in lists[w]})
    out = [("Coaches and team officials in the FA report", len(result.coaches)),
           ("Teams without a qualified coach/manager (FA: Incomplete)",
            sum(1 for t in result.teams if t.complete.lower() == "incomplete")),
           ("Expired", people(EXPIRED)),
           ("Not held", people(NOT_HELD)),
           ("Expires within 1 month", people(M1)),
           ("Expires in 1 to 3 months", people(M3)),
           ("Expires in 3 to 6 months", people(M6)),
           ("All three in date for 6 months or more",
            sum(1 for c in result.coaches if all(c.certs[k].window(today) == OK for k, _n in CERTS)))]
    if result.officials_checked:
        out += [("In the FA report but not the officials file",
                 sum(1 for c in result.coaches if c.note == "Not in the officials file")),
                ("In the officials file with a team role but not the FA report", len(result.not_in_fa))]
    return out


def find_latest_qualifications(folder: str, limit: int = 40) -> str:
    """Newest FA Team Qualifications Report among the most recent Excel files in a folder, or ''."""
    import os
    try:
        files = [os.path.join(folder, f) for f in os.listdir(folder)
                 if f.lower().endswith((".xlsx", ".xlsm")) and not f.startswith("~$")]
    except OSError:
        return ""
    files.sort(key=lambda f: os.path.getmtime(f), reverse=True)
    # the FA names it "<Club>_TeamQualificationReport_<date>.xlsx"; other files are not opened (that is slow)
    for path in [f for f in files[:limit] if "qualification" in os.path.basename(f).lower()]:
        if detect_qualifications(path):
            return path
    return ""
