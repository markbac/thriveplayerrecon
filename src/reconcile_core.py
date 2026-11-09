"""Core logic for reconciling an FA player registration report with a Thrive export.

No GUI code lives here, so it can be tested on its own.

Matching rules
--------------
Thrive has no FAN ID, so players are paired on name and date of birth:

- first name: exact, nickname (Sam/Samuel, Teddy/Edward), prefix (Thomas/Thomas James)
  or a close typo
- surname: exact, prefix/suffix (Beswick / Adamos Beswick) or a close typo
- date of birth: exact, one field wrong (day, month or year) or day/month swapped

Only an exact name and exact DOB is reported as "Matched". Any difference is reported as
"Check match" with the differences spelled out, so a human confirms it.
"""
from __future__ import annotations

import difflib
import os
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

from version import __version__

IGNORE = None  # mapping value meaning "this Thrive team has no FA equivalent"
# Team-sheet source for players in such a team (U4-U6, training groups): FA registration is not needed
NO_FA = "No FA needed"

# Default Thrive team -> FA team mapping, derived from the first pair of exports.
# Thrive values on the left, FA team names on the right, None = ignore.
_CLUB = "Wilpshire Wanderers "
DEFAULT_TEAM_MAP: Dict[str, Optional[str]] = {
    "U07 Eagles": _CLUB + "U7 Eagles",
    "U07 Falcons": _CLUB + "U7 Falcons",
    "U08 Black": _CLUB + "U8 Black",
    "U08 Blue": _CLUB + "U8 Blue",
    "U08 Red": _CLUB + "U8 Red",
    "U08 White": _CLUB + "U8 White",
    "U09 Black": _CLUB + "U9 Black",
    "U09 Red": _CLUB + "U9 Red",
    "U09 White": _CLUB + "U9 White",
    "U10 Black": _CLUB + "U10 Black",
    "U10 Blue": _CLUB + "U10 Blue",
    "U10 Green": _CLUB + "U10 Green",
    "U10 White": _CLUB + "U10 White",
    "U11 Black": _CLUB + "U11 Black",
    "U11 White": _CLUB + "U11 White",
    "U12 Black": _CLUB + "U12 Black",
    "U12 Red": _CLUB + "U12 Red",
    "U13 Blue": _CLUB + "U13 Blue",
    "U15 Blue": _CLUB + "U15 Blue",
    "U16 Blue": _CLUB + "U16 Blue",
    "U16 Red": _CLUB + "U16 Red",
    "U18 Black": _CLUB + "U18 Black",
    # Thrive-only groups with no FA registration: still checked for a mandate, not for the FA
    "U04": IGNORE,
    "U05": IGNORE,
    "U06": IGNORE,
    "U7-8 Training": IGNORE,
    "U9-10 Training": IGNORE,
}

# Small nickname table; extend as needed. Prefix matching already covers Sam/Samuel etc.
NICKNAMES = {
    "teddy": "edward", "ted": "edward", "eddie": "edward",
    "jake": "jacob", "charlie": "charles", "alfie": "alfred",
    "bobby": "robert", "jimmy": "james", "tommy": "thomas",
    "billy": "william", "will": "william", "harry": "henry",
}

FA_REQUIRED = ["first names", "surname", "fan id", "date of birth", "team", "registration status"]
THRIVE_REQUIRED = ["last name", "first name", "date of birth", "teams"]

ADULT_AGE = 19          # a Thrive DOB giving this age or more is probably a parent/carer's
DEFAULT_FUZZY = 0.8     # minimum similarity (0-1) for a typo-tolerant name match

# Optional columns, found by header text (exact, then starts-with, then contains).
THRIVE_FIELDS = {
    "account_owner": ["account owner"], "owner_phone": ["owner phone"],
    "pg_name": ["parents/guardian name"], "pg_email": ["parents/guardian email"],
    "pg_dob": ["parents/guardian date of birth"],
    "photo": ["wwfc photography policy", "photography"],
    "conduct": ["wwfc code of conduct", "code of conduct"], "club_rules": ["club rules"],
    "has_medical": ["has medical conditions"], "conditions": ["medical conditions"],
    "allergies": ["allergies"], "medicines": ["medicines"], "behavioural": ["behavioural conditions"],
    "disabilities": ["disabilities"], "other": ["other conditions"], "doctor": ["doctor name"],
    "doctor_phone": ["doctors phone", "doctor phone"], "surgery": ["surgery address"],
    "notes": ["medical notes"],
}
FA_FIELDS = {
    "email": ["email address"], "parent_email": ["parent/carer email address"],
    "parent_name": ["parent/carer name"], "emergency": ["emergency contact"],
    "emergency_phone": ["emergency contact ph"], "consent": ["consent given"],
    "other_clubs": ["other clubs"],
}

LEVELS = {  # result -> level (bad > warn > info > ok)
    "Matched": "ok",
    "Matched (data quality)": "warn",
    "Matched (team differs)": "warn",
    "Check match": "warn",
    "Thrive only": "bad",
    "FA only": "bad",
    "Thrive only (expected)": "info",
    "FA only (not registered)": "info",
}
_LEVEL_ORDER = {"bad": 0, "warn": 1, "info": 2, "ok": 3}


class ReportError(Exception):
    """A file could not be read as the expected report."""


# --------------------------------------------------------------------------- data types

@dataclass
class FAPlayer:
    fan_id: str
    first: str
    last: str
    dob: Optional[date]
    suspended: bool = False
    teams: Dict[str, str] = field(default_factory=dict)  # team -> registration status
    parents: List[str] = field(default_factory=list)     # parent/carer names, used for DQ checks
    fields: Dict[str, str] = field(default_factory=dict)  # contact details etc., see FA_FIELDS

    def registered_teams(self) -> List[str]:
        return [t for t, s in self.teams.items() if s.lower() == "registered"]


@dataclass
class ThrivePlayer:
    first: str
    last: str
    dob: Optional[date]
    mandate: str = ""
    teams: List[str] = field(default_factory=list)  # raw Thrive team names, de-duplicated
    fields: Dict[str, str] = field(default_factory=dict)  # contacts, medical, consents, see THRIVE_FIELDS


@dataclass
class Staff:
    """A manager or assistant manager from the optional managers file."""
    name: str
    role: str = "Manager"
    teams: List[str] = field(default_factory=list)  # team names as written in the file
    phone: str = ""
    email: str = ""

    @property
    def kind(self) -> str:
        r = self.role.lower()
        if any(w in r for w in ("assist", "asst", "deputy")):
            return "assistant"
        return "manager" if (not r or "manager" in r or "head coach" in r) else "other"


@dataclass
class Row:
    result: str
    confidence: str
    issue: str
    dq: str
    fan_id: str
    fa_name: str
    thrive_name: str
    fa_dob: Optional[date]
    thrive_dob: Optional[date]
    fa_teams: str
    thrive_teams: str
    expected_fa_teams: str
    fa_status: str
    mandate: str
    fa: Optional[FAPlayer] = None
    th: Optional[ThrivePlayer] = None

    @property
    def level(self) -> str:
        return LEVELS[self.result]


@dataclass
class Result:
    rows: List[Row]
    club_prefix: str
    # team label -> [(source, row)] where source is "Both", "FA only" or "Thrive only"
    teams: Dict[str, List[Tuple[str, Row]]] = field(default_factory=dict)
    # team label -> staff assigned, and notes about the managers file (set by attach_staff)
    staff: Dict[str, List[Staff]] = field(default_factory=dict)
    staff_issues: List[str] = field(default_factory=list)

    def counts(self) -> Counter:
        return Counter(r.result for r in self.rows)


# --------------------------------------------------------------------------- reading files

def _hdr(value) -> str:
    return " ".join(str(value or "").split()).lower()


def _s(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return " ".join(str(value).split())


def _to_date(value) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = _s(value)
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    return None


def _read_table(path: str, required: List[str], what: str):
    """Return (rows, column index by header) from the first sheet that has the headers."""
    import openpyxl

    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as exc:  # corrupt file, wrong format, locked by Excel
        raise ReportError(f"Could not open {os.path.basename(path)}: {exc}") from exc
    try:
        for ws in wb.worksheets:
            rows = list(ws.iter_rows(values_only=True))
            for i, row in enumerate(rows[:40]):
                cells = [_hdr(c) for c in row]
                if all(h in cells for h in required):
                    cols = {h: j for j, h in enumerate(cells) if h}
                    return rows[i + 1:], cols
    finally:
        wb.close()
    raise ReportError(
        f"{os.path.basename(path)} does not look like the {what}. "
        f"Expected columns: {', '.join(required)}."
    )


def _find_col(cols: Dict[str, int], candidates: List[str]) -> Optional[int]:
    for test in (lambda h, c: h == c, lambda h, c: h.startswith(c), lambda h, c: c in h):
        for cand in candidates:
            for header, idx in cols.items():
                if test(header, cand):
                    return idx
    return None


def _field_cols(cols: Dict[str, int], spec: Dict[str, List[str]]) -> Dict[str, int]:
    found = {}
    for name, cands in spec.items():
        idx = _find_col(cols, cands)
        if idx is not None:
            found[name] = idx
    return found


def _dedupe_csv(text: str) -> str:
    """'0778, 0778' -> '0778'."""
    seen: List[str] = []
    for part in text.split(","):
        part = part.strip()
        if part and part not in seen:
            seen.append(part)
    return ", ".join(seen)


def _cell(row, idx) -> str:
    if idx is None or idx >= len(row):
        return ""
    v = row[idx]
    if isinstance(v, (datetime, date)):
        return _to_date(v).strftime("%d/%m/%Y")
    return _s(v)


def detect_kind(path: str) -> Optional[str]:
    """'fa' or 'thrive' from the column headers, or None if it is neither (or unreadable)."""
    import openpyxl
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception:
        return None
    try:
        for ws in wb.worksheets:
            for row in ws.iter_rows(max_row=40, values_only=True):
                cells = [_hdr(c) for c in row]
                if all(h in cells for h in FA_REQUIRED):
                    return "fa"
                if all(h in cells for h in THRIVE_REQUIRED):
                    return "thrive"
    except Exception:
        return None
    finally:
        wb.close()
    return None


def find_latest_exports(folder: str, limit: int = 40) -> Dict[str, str]:
    """Newest FA report and newest Thrive export among the most recent .xlsx files in a folder."""
    try:
        files = [os.path.join(folder, f) for f in os.listdir(folder)
                 if f.lower().endswith((".xlsx", ".xlsm")) and not f.startswith("~$")]
    except OSError:
        return {}
    files.sort(key=lambda f: os.path.getmtime(f), reverse=True)
    found: Dict[str, str] = {}
    for path in files[:limit]:
        kind = detect_kind(path)
        if kind and kind not in found:
            found[kind] = path
        if len(found) == 2:
            break
    return found


def load_fa(path: str) -> List[FAPlayer]:
    """Read the FA 'Club - Player Report'. One FA player can span several rows (one per team)."""
    rows, c = _read_table(path, FA_REQUIRED, "FA player registration report")
    suspended_col = c.get("suspended")
    parent_col = c.get("parent/carer name")
    fa_cols = _field_cols(c, FA_FIELDS)
    players: Dict[tuple, FAPlayer] = {}
    for r in rows:
        first, last = _s(r[c["first names"]]), _s(r[c["surname"]])
        if not (first or last):
            continue
        dob = _to_date(r[c["date of birth"]])
        fan = _s(r[c["fan id"]])
        key = ("fan", fan) if fan else ("name", squash(first), squash(last), dob)
        p = players.get(key)
        if p is None:
            p = players[key] = FAPlayer(fan, first, last, dob)
        team, status = _s(r[c["team"]]), _s(r[c["registration status"]])
        if team and (team not in p.teams or status.lower() == "registered"):
            p.teams[team] = status
        for name, idx in fa_cols.items():
            value = _cell(r, idx)
            if value and not p.fields.get(name):
                p.fields[name] = value
        if parent_col is not None:
            for name in _s(r[parent_col]).split(","):
                if name.strip() and name.strip() not in p.parents:
                    p.parents.append(name.strip())
        if suspended_col is not None and _s(r[suspended_col]).lower() in ("true", "yes", "y"):
            p.suspended = True
    return list(players.values())


def load_thrive(path: str) -> List[ThrivePlayer]:
    """Read the Thrive data export. The 'teams' cell is a comma separated list."""
    rows, c = _read_table(path, THRIVE_REQUIRED, "Thrive data export")
    mandate_col = c.get("active mandates")
    th_cols = _field_cols(c, THRIVE_FIELDS)
    players: List[ThrivePlayer] = []
    for r in rows:
        first, last = _s(r[c["first name"]]), _s(r[c["last name"]])
        if not (first or last):
            continue
        teams: List[str] = []
        for t in _s(r[c["teams"]]).split(","):
            t = t.strip()
            if t and t.lower() not in [x.lower() for x in teams]:
                teams.append(t)
        extra = {name: _cell(r, idx) for name, idx in th_cols.items()}
        if extra.get("owner_phone"):
            extra["owner_phone"] = _dedupe_csv(extra["owner_phone"])
        players.append(ThrivePlayer(
            first, last, _to_date(r[c["date of birth"]]),
            _s(r[mandate_col]) if mandate_col is not None else "", teams, extra))
    return players


# --------------------------------------------------------------------------- name matching

def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(ch for ch in text if not unicodedata.combining(ch)).lower()


def squash(text: str) -> str:
    """Lower case, accents and punctuation removed: 'Wroe-Hampson' -> 'wroehampson'."""
    return re.sub(r"[^a-z0-9]", "", _fold(text))


def _name_score(a: str, b: str, allow_suffix: bool, fuzzy: float = DEFAULT_FUZZY) -> float:
    sa, sb = squash(a), squash(b)
    if not sa or not sb:
        return 0.0
    if sa == sb:
        return 1.0
    short, long_ = sorted((sa, sb), key=len)
    if len(short) >= 3 and long_.startswith(short):
        return 0.92
    if allow_suffix and len(short) >= 4 and long_.endswith(short):
        return 0.9
    if NICKNAMES.get(sa, sa) == NICKNAMES.get(sb, sb):
        return 0.9
    ratio = difflib.SequenceMatcher(None, sa, sb).ratio()
    return round(ratio * 0.9, 3) if ratio >= fuzzy else 0.0


def _dob_score(a: Optional[date], b: Optional[date]) -> float:
    if a is None or b is None:
        return 0.2
    if a == b:
        return 1.0
    same = (a.day == b.day) + (a.month == b.month) + (a.year == b.year)
    swapped = a.year == b.year and a.day == b.month and a.month == b.day
    return 0.6 if same == 2 or swapped else 0.2


def _pair_up(thrive: List[ThrivePlayer], fa: List[FAPlayer], fuzzy: float = DEFAULT_FUZZY):
    """Greedy one-to-one pairing, best score first.

    Returns {thrive_idx: (fa_idx, first_score, last_score, dob_score, swapped)}.
    Names entered the wrong way round (first name in the surname box) are also paired.
    """
    cands = []
    for ti, t in enumerate(thrive):
        for fi, f in enumerate(fa):
            fs = _name_score(t.first, f.first, False, fuzzy)
            ls = _name_score(t.last, f.last, True, fuzzy) if fs else 0.0
            swapped = False
            if not (fs and ls):  # try first/last swapped, at a small penalty
                fs2 = _name_score(t.first, f.last, True, fuzzy)
                ls2 = _name_score(t.last, f.first, False, fuzzy) if fs2 else 0.0
                if fs2 and ls2:
                    fs, ls, swapped = fs2 * 0.9, ls2 * 0.9, True
                else:
                    continue
            ds = _dob_score(t.dob, f.dob)
            cands.append((-(0.35 * fs + 0.35 * ls + 0.3 * ds), ti, fi, fs, ls, ds, swapped))
    cands.sort()
    pairs, used_fa = {}, set()
    for _, ti, fi, fs, ls, ds, swapped in cands:
        if ti not in pairs and fi not in used_fa:
            pairs[ti] = (fi, fs, ls, ds, swapped)
            used_fa.add(fi)
    return pairs


# --------------------------------------------------------------------------- data quality

def _age_on(dob: date, ref: date) -> int:
    return ref.year - dob.year - ((ref.month, ref.day) < (dob.month, dob.day))


def _season_ref(today: date) -> date:
    """Football age is taken at 31 August before the season: Nov 2026 -> 31/08/2026."""
    return date(today.year if today.month >= 9 else today.year - 1, 8, 31)


def _team_age_limit(team: str) -> Optional[int]:
    m = re.search(r"\bu0*(\d+)\b", team, re.I)
    return int(m.group(1)) if m else None


def _bad_case(word: str) -> bool:
    letters = [ch for ch in word if ch.isalpha()]
    return len(letters) > 1 and (word == word.lower() or word == word.upper()) or \
        bool(letters) and word[:1].islower()


def _case_issue(first: str, last: str) -> bool:
    return _bad_case(first) or _bad_case(last)


def _parent_index(fa: List[FAPlayer]):
    """[(first, last, child name)] for every FA parent/carer with at least two name parts."""
    out = []
    for f in fa:
        for full in f.parents:
            parts = full.split()
            if len(parts) >= 2:
                out.append((parts[0], parts[-1], f"{f.first} {f.last}"))
    return out


def _matches_parent(first: str, last: str, parents, fuzzy: float) -> Optional[str]:
    for pf, pl, child in parents:
        if _name_score(first, pf, False, fuzzy) >= 0.9 and _name_score(last, pl, False, fuzzy) >= 0.9:
            return child
    return None


# --------------------------------------------------------------------------- team mapping

def _tkey(name: str) -> str:
    return " ".join(str(name).split()).lower()


def club_prefix(fa_teams) -> str:
    """Longest shared leading words of the FA team names, e.g. 'Wilpshire Wanderers'."""
    split = [t.split() for t in fa_teams]
    if not split:
        return ""
    words = []
    for group in zip(*split):
        # stop at the first differing word or at the age group (U10), which is never club name
        if len(set(group)) != 1 or re.fullmatch(r"u\d+", group[0], re.I):
            break
        words.append(group[0])
    return " ".join(words)


def _team_form(name: str, prefix: str) -> str:
    text = name[len(prefix):] if prefix and name.startswith(prefix) else name
    text = _fold(text)
    text = re.sub(r"\bu0*(\d+)", r"u\1", text)
    return " ".join(re.findall(r"[a-z0-9-]+", text))


def suggest_mapping(thrive_teams, fa_teams) -> Dict[str, Optional[str]]:
    """Suggest Thrive -> FA team names. Only confident suggestions are returned.

    'U07 Eagles' -> 'Wilpshire Wanderers U7 Eagles' by normalising the age group.
    Training squads and bare age groups with no FA equivalent are mapped to ignore.
    Anything else is left out so the user decides.
    """
    fa_teams = list(fa_teams)
    prefix = club_prefix(fa_teams)
    by_form = {_team_form(t, prefix): t for t in fa_teams}
    out: Dict[str, Optional[str]] = {}
    for t in thrive_teams:
        form = _team_form(t, "")
        if form in by_form:
            out[t] = by_form[form]
        elif "training" in form or re.fullmatch(r"u\d+", form):
            out[t] = IGNORE
    return out


# --------------------------------------------------------------------------- reconcile

def _fmt_date(d: Optional[date]) -> str:
    return d.strftime("%d/%m/%Y") if d else "none"


def reconcile(fa: List[FAPlayer], thrive: List[ThrivePlayer],
              team_map: Dict[str, Optional[str]], fuzzy: float = DEFAULT_FUZZY,
              today: Optional[date] = None) -> Result:
    today = today or date.today()
    season_ref = _season_ref(today)
    lookup = {_tkey(k): v for k, v in team_map.items()}
    prefix = club_prefix({t for p in fa for t in p.teams})
    parents = _parent_index(fa)

    def short(team: str) -> str:
        return team[len(prefix):].strip() if prefix and team.startswith(prefix) else team

    def expected_for(t: ThrivePlayer):
        expected, unmapped = [], []
        for name in t.teams:
            if _tkey(name) not in lookup:
                unmapped.append(name)
            elif lookup[_tkey(name)] is not IGNORE and lookup[_tkey(name)] not in expected:
                expected.append(lookup[_tkey(name)])
        return expected, unmapped

    def age_flags(dob: Optional[date], teams, source: str) -> List[str]:
        out = []
        if dob is None:
            return out
        age = _age_on(dob, season_ref)
        for team in teams:
            limit = _team_age_limit(team)
            if limit is not None and age >= limit:
                out.append(f"{source} DOB gives age {age} at {season_ref:%d/%m/%Y}, too old for {short(team)}")
        return out

    def thrive_flags(t: ThrivePlayer) -> List[str]:
        out = []
        if t.dob is None:
            out.append("Thrive has no date of birth")
        elif _age_on(t.dob, today) >= ADULT_AGE:
            out.append(f"Thrive DOB gives age {_age_on(t.dob, today)}: parent/carer details entered instead of the player's?")
        child = _matches_parent(t.first, t.last, parents, fuzzy)
        if child:
            out.append(f"Thrive name matches an FA parent/carer of {child}")
        if _case_issue(t.first, t.last):
            out.append(f"Thrive name capitalisation: '{t.first} {t.last}'")
        return out

    pairs = _pair_up(thrive, fa, fuzzy)
    rows: List[Row] = []

    # possible duplicate Thrive records (same fuzzy name and same DOB)
    dup_notes: Dict[int, str] = {}
    for i in range(len(thrive)):
        for j in range(i + 1, len(thrive)):
            a_, b_ = thrive[i], thrive[j]
            if a_.dob and a_.dob == b_.dob and _name_score(a_.first, b_.first, False, fuzzy) \
                    and _name_score(a_.last, b_.last, True, fuzzy):
                dup_notes[i] = f"Possible duplicate Thrive record: {b_.first} {b_.last}"
                dup_notes[j] = f"Possible duplicate Thrive record: {a_.first} {a_.last}"

    for ti, t in enumerate(thrive):
        expected, unmapped = expected_for(t)
        dq = thrive_flags(t)
        if ti in dup_notes:
            dq.append(dup_notes[ti])
        if ti in pairs:
            fi, fs, ls, ds, swapped = pairs[ti]
            f = fa[fi]
            active = f.registered_teams()
            issues = []
            if swapped:
                issues.append(f"Name: first/last swapped, FA '{f.first} {f.last}' vs Thrive '{t.first} {t.last}'")
            elif fs < 1 or ls < 1:
                issues.append(f"Name: FA '{f.first} {f.last}' vs Thrive '{t.first} {t.last}'")
            if ds < 1:
                issues.append(f"DOB: FA {_fmt_date(f.dob)} vs Thrive {_fmt_date(t.dob)}")
            confidence = ("Exact" if not issues else
                          "Name differs" if ds == 1 else
                          "DOB differs" if fs == 1 and ls == 1 else "Name and DOB differ")
            team_issues = []
            for team in expected:
                if team not in active:
                    team_issues.append(f"Thrive team {short(team)} but not registered in FA")
            for team in active:
                if team not in expected:
                    team_issues.append(f"FA team {short(team)} but not in Thrive")
            if unmapped:
                team_issues.append("Unmapped Thrive team: " + ", ".join(unmapped))
            if not active:
                states = ", ".join(sorted(set(f.teams.values()))) or "none"
                team_issues.append(f"No active FA registration (status: {states})")
            if f.suspended:
                team_issues.append("Suspended in FA")
            # The FA date of birth is the reference when the two disagree
            dq += age_flags(f.dob or t.dob, active, "FA" if f.dob else "Thrive")
            if _case_issue(f.first, f.last):
                dq.append(f"FA name capitalisation: '{f.first} {f.last}'")
            result = ("Check match" if issues else
                      "Matched (team differs)" if team_issues else
                      "Matched (data quality)" if dq else "Matched")
            rows.append(Row(
                result, confidence, "; ".join(issues + team_issues), "; ".join(dq), f.fan_id,
                f"{f.first} {f.last}", f"{t.first} {t.last}", f.dob, t.dob,
                ", ".join(short(x) for x in active), ", ".join(t.teams),
                ", ".join(short(x) for x in expected),
                ", ".join(sorted(set(f.teams.values()))), t.mandate, f, t))
        else:
            dq += age_flags(t.dob, expected, "Thrive")
            if unmapped:
                result, issue = "Thrive only", "Not found in FA. Unmapped Thrive team: " + ", ".join(unmapped)
            elif expected:
                result, issue = "Thrive only", "Not found in FA report"
            elif t.teams:
                result, issue = "Thrive only (expected)", "Only in teams with no FA equivalent"
            else:
                result, issue = "Thrive only", "Not found in FA and has no team in Thrive"
            rows.append(Row(result, "", issue, "; ".join(dq), "", "", f"{t.first} {t.last}", None, t.dob,
                            "", ", ".join(t.teams), ", ".join(short(x) for x in expected), "", t.mandate, None, t))

    matched_fa = {v[0] for v in pairs.values()}
    fa_dups: Dict[int, str] = {}
    for i in range(len(fa)):
        for j in range(i + 1, len(fa)):
            a_, b_ = fa[i], fa[j]
            if a_.dob and a_.dob == b_.dob and _name_score(a_.first, b_.first, False, fuzzy) \
                    and _name_score(a_.last, b_.last, True, fuzzy):
                fa_dups[i] = f"Possible duplicate FA record (FAN ID {b_.fan_id})"
                fa_dups[j] = f"Possible duplicate FA record (FAN ID {a_.fan_id})"
    for fi, f in enumerate(fa):
        if fi in matched_fa:
            continue
        active = f.registered_teams()
        states = ", ".join(sorted(set(f.teams.values())))
        dq = age_flags(f.dob, active, "FA")
        if _case_issue(f.first, f.last):
            dq.append(f"FA name capitalisation: '{f.first} {f.last}'")
        if fi in fa_dups:
            dq.append(fa_dups[fi])
        if active:
            result, issue = "FA only", "Registered in FA but not found in Thrive"
        else:
            result, issue = "FA only (not registered)", f"FA status {states}, so not expected in Thrive"
        rows.append(Row(result, "", issue, "; ".join(dq), f.fan_id, f"{f.first} {f.last}", "", f.dob, None,
                        ", ".join(short(x) for x in active), "", "", states, "", f, None))
    # duplicates among matched FA players still deserve a flag
    for fi, note in fa_dups.items():
        if fi in matched_fa:
            for row in rows:
                if row.fan_id == fa[fi].fan_id and row.fa_name:
                    row.dq = "; ".join(x for x in (row.dq, note) if x)
                    if row.result == "Matched":
                        row.result = "Matched (data quality)"

    rows.sort(key=lambda r: (_LEVEL_ORDER[r.level], r.result,
                             (r.fa_name or r.thrive_name).split()[-1].lower() if (r.fa_name or r.thrive_name) else ""))

    # Team membership: which system(s) put the player in each team
    teams: Dict[str, List[Tuple[str, Row]]] = {}
    for row in rows:
        active = row.fa.registered_teams() if row.fa else []
        expected = expected_for(row.th)[0] if row.th else []
        for team in active + [x for x in expected if x not in active]:
            source = "Both" if team in active and team in expected else "FA only" if team in active else "Thrive only"
            teams.setdefault(short(team), []).append((source, row))
        for name in (row.th.teams if row.th else []):
            if _tkey(name) not in lookup:  # unmapped: still needs a decision, so flag as Thrive only
                teams.setdefault(f"{name} (Thrive)", []).append(("Thrive only", row))
            elif lookup[_tkey(name)] is IGNORE:  # no FA team exists for this group
                teams.setdefault(f"{name} (Thrive)", []).append((NO_FA, row))
    for members in teams.values():
        members.sort(key=lambda m: ((m[1].fa_name or m[1].thrive_name).split()[-1].lower(),
                                    (m[1].fa_name or m[1].thrive_name).lower()))
    return Result(rows, prefix, teams)


# --------------------------------------------------------------------------- reports

# (tab title, which rows it shows) -- shared by the GUI tabs and the Excel export
RESULT_TABS = [
    ("All players", lambda r: True),
    ("Needs attention", lambda r: r.level in ("bad", "warn")),
    ("In Thrive, not in FA", lambda r: r.result == "Thrive only"),
    ("No FA team (U4-U6, training)", lambda r: r.result == "Thrive only (expected)"),
    ("In FA, not in Thrive", lambda r: r.result.startswith("FA only")),
    ("Check match", lambda r: r.result == "Check match"),
    ("Team differs", lambda r: r.result == "Matched (team differs)"),
    ("Data quality", lambda r: bool(r.dq)),
]

SOURCE_FILLS = {"Both": "E2F0D9", "FA only": "FCE4D6", "Thrive only": "DDEBF7", NO_FA: "EDEDED"}
CONFIDENTIAL = ("CONFIDENTIAL: contains children's personal data protected by UK GDPR. Share only with those who "
                "need it, keep it secure and delete it when finished.")

_NOTHING = {"", "n/a", "na", "none", "no", "nil", "-", "false", "not applicable"}


def team_labels(result: Result) -> List[str]:
    def key(label):
        m = re.match(r"u0*(\d+)", label, re.I)
        return (int(m.group(1)) if m else 999, label.lower())
    return sorted(result.teams, key=key)


def _meaningful(value: str) -> bool:
    return value.strip().lower().rstrip(".") not in _NOTHING


def _source(row: Row) -> str:
    if row.fa and row.th:
        return "Both"
    if row.fa:
        return "FA only"
    return NO_FA if row.result == "Thrive only (expected)" else "Thrive only"


def _fa_mark(source: str) -> str:
    """WhatsApp FA status: tick, cross, or 'not needed' for groups with no FA team."""
    if source == NO_FA:
        return "FA not needed"
    return "FA " + ("✅" if source in ("Both", "FA only") else "❌")


def _name_dob(row: Row, today: date):
    dob = row.fa_dob or row.thrive_dob
    return (row.fa_name or row.thrive_name), dob, (_age_on(dob, today) if dob else "")


def _contact_values(row: Row) -> List[str]:
    t = row.th.fields if row.th else {}
    f = row.fa.fields if row.fa else {}
    return [t.get("account_owner", ""), t.get("owner_phone", ""), t.get("pg_name", ""), t.get("pg_email", ""),
            f.get("parent_name", ""), f.get("parent_email", ""), f.get("email", ""),
            f.get("emergency", ""), f.get("emergency_phone", "")]


CONTACT_HEADERS = ["Account owner (Thrive)", "Owner phone (Thrive)", "Parent/guardian (Thrive)",
                   "Parent/guardian email (Thrive)", "Parent/carer (FA)", "Parent/carer email (FA)",
                   "Player email (FA)", "Emergency contact (FA)", "Emergency phone (FA)"]
MEDICAL_HEADERS = ["Medical info?", "Has medical conditions", "Medical conditions", "Allergies", "Medicines",
                   "Behavioural conditions", "Disabilities", "Other conditions", "Doctor", "Doctor phone",
                   "Surgery address", "Medical notes"]
CONSENT_HEADERS = ["Photography policy", "Code of conduct (Thrive)", "FA consent given"]


def _medical_values(row: Row) -> List[str]:
    t = row.th.fields if row.th else {}
    keys = ["has_medical", "conditions", "allergies", "medicines", "behavioural", "disabilities", "other",
            "doctor", "doctor_phone", "surgery", "notes"]
    detail = ["conditions", "allergies", "medicines", "behavioural", "disabilities", "other", "notes"]
    flag = "Yes" if (t.get("has_medical", "").lower() == "true"
                     or any(_meaningful(t.get(k, "")) for k in detail)) else ("" if not t else "No")
    return [flag] + [t.get(k, "") for k in keys]


def team_report(result: Result, label: str, include_medical: bool = True, today: Optional[date] = None):
    """(headers, [(values, source)]) for one team, for the manager's player sheet."""
    today = today or date.today()
    headers = PLAYER_HEADERS + CONTACT_HEADERS + (MEDICAL_HEADERS if include_medical else []) + CONSENT_HEADERS
    rows = []
    for source, row in result.teams.get(label, []):
        name, dob, age = _name_dob(row, today)
        t = row.th.fields if row.th else {}
        f = row.fa.fields if row.fa else {}
        mandate = "Not in Thrive" if not row.th else (row.th.mandate or "None")
        values = [name, dob, age, source, row.fa_status, mandate, paying_status(row), row.issue] \
            + _contact_values(row) \
            + (_medical_values(row) if include_medical else []) \
            + [t.get("photo", ""), t.get("conduct", ""), f.get("consent", "")]
        rows.append((values, source))
    return headers, rows


PLAYER_HEADERS = ["Player", "DOB", "Age", "In", "FA status", "Thrive mandate", "Paying through Thrive",
                  "Reconciliation note"]


def paying_status(row: Row) -> str:
    """Whether the player pays through Thrive, using the same rule as the Not paying list."""
    if row.th is not None:
        return "Yes" if row.th.mandate else "No: no active mandate"
    return "No: not in Thrive" if row.result == "FA only" else "Not expected (not registered)"

# Sections for the full-details window, in the order they are shown
TEAM_DETAIL_SECTIONS = [("Player", PLAYER_HEADERS), ("Contacts", CONTACT_HEADERS),
                        ("Medical", MEDICAL_HEADERS), ("Consents", CONSENT_HEADERS)]


def team_view_headers(include_medical: bool = True) -> List[str]:
    """Columns for the compact on-screen team list (the full detail is shown on double-click)."""
    return ["Player", "Age", "In", "FA status", "Paying", "Main contact"] \
        + (["Medical"] if include_medical else []) + ["Note"]


def team_overview(headers: List[str], values: list, include_medical: bool = True) -> list:
    """Reduce one full team_report row to the compact on-screen columns."""
    v = dict(zip(headers, values))
    contact = (v.get("Account owner (Thrive)") or v.get("Parent/guardian (Thrive)")
               or v.get("Parent/carer (FA)") or "")
    out = [v["Player"], v["Age"], v["In"], v["FA status"], v["Paying through Thrive"], contact]
    if include_medical:
        flag = v.get("Medical info?") or "Not known"
        out.append("⚠ Yes" if flag == "Yes" else flag)  # warning sign so it stands out in the list
    return out + [v["Reconciliation note"]]


NOT_PAYING_NOTE = ("Players with no active Thrive mandate, or registered with the FA but not found in Thrive. "
                   "FA-only players may be in Thrive under a different name: check before chasing.")


def not_paying_report(result: Result, today: Optional[date] = None):
    """(headers, [(values, source)]) for players who are not paying via Thrive."""
    today = today or date.today()
    headers = ["Player", "DOB", "Age", "Team(s)", "Reason", "In", "Account owner (Thrive)",
               "Owner phone (Thrive)", "Parent/guardian (Thrive)", "Parent/guardian email (Thrive)",
               "Parent/carer (FA)", "Parent/carer email (FA)", "Emergency contact (FA)", "Emergency phone (FA)"]
    rows = []
    for row in result.rows:
        if row.th is not None and not row.th.mandate:
            reason = "No active mandate in Thrive"
        elif row.result == "FA only":
            reason = "Registered in FA, not found in Thrive"
        else:
            continue
        name, dob, age = _name_dob(row, today)
        c = _contact_values(row)
        rows.append(([name, dob, age, row.fa_teams or row.thrive_teams, reason, _source(row)]
                     + c[0:4] + c[4:6] + c[7:9], _source(row)))
    rows.sort(key=lambda r: (r[0][4], r[0][0].split()[-1].lower()))
    return headers, rows


# --------------------------------------------------------------------------- managers file

_TEAM_HEADERS = ["team", "teams", "team(s)", "assigned teams", "assigned team", "age group", "squad"]
_NO_PEOPLE = ("phone", "mobile", "tel", "email", "e-mail")


def _split_list(text: str) -> List[str]:
    return [p.strip() for p in re.split(r"\s*(?:,|;|/|&|\n|\band\b)\s*", text or "") if p.strip()]


def _read_sheets(path: str) -> List[List[tuple]]:
    """Every sheet of an Excel file, or the single table of a CSV file, as lists of row tuples."""
    if path.lower().endswith(".csv"):
        import csv
        try:
            with open(path, newline="", encoding="utf-8-sig") as fh:
                return [[tuple(r) for r in csv.reader(fh)]]
        except OSError as exc:
            raise ReportError(f"Could not open {os.path.basename(path)}: {exc}") from exc
    import openpyxl
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as exc:
        raise ReportError(f"Could not open {os.path.basename(path)}: {exc}") from exc
    try:
        return [list(ws.iter_rows(values_only=True)) for ws in wb.worksheets]
    finally:
        wb.close()


STAFF_HELP = ("Expected either: a Name column, a Role column (Manager or Assistant manager) and a Team(s) column, "
              "or one row per team with Team, Manager and Assistant manager columns.")


def load_staff(path: str) -> List[Staff]:
    """Read the optional managers file (.xlsx or .csv).

    Two layouts are understood, found from the column headings:
    - one row per person: Name, Role, Team(s), and optionally Phone and Email
    - one row per team: Team, Manager, Assistant manager (several names may be separated by commas)
    A person can have several teams in one cell, separated by commas, slashes or 'and'.
    """
    people: Dict[tuple, Staff] = {}

    def add(name: str, role: str, teams: List[str], phone: str = "", email: str = "") -> None:
        key = (name.lower(), Staff(name, role).kind)
        p = people.setdefault(key, Staff(name, role))
        p.teams += [t for t in teams if t not in p.teams]
        p.phone, p.email = p.phone or phone, p.email or email

    for rows in _read_sheets(path):
        for i, row in enumerate(rows[:15]):
            cols = {_hdr(c): j for j, c in enumerate(row) if _hdr(c)}
            team_i = _find_col(cols, _TEAM_HEADERS)
            if team_i is None:
                continue
            name_i = _find_col(cols, ["name", "full name", "person", "staff"])
            role_i = _find_col(cols, ["role", "position", "job"])
            phone_i = _find_col(cols, ["phone", "mobile", "telephone", "tel"])
            email_i = _find_col(cols, ["email", "e-mail"])
            mgr = [j for h, j in cols.items() if "manager" in h and "assist" not in h
                   and not any(x in h for x in _NO_PEOPLE) and j != team_i]
            asst = [j for h, j in cols.items() if any(w in h for w in ("assist", "asst", "deputy"))
                    and not any(x in h for x in _NO_PEOPLE) and j != team_i]
            if name_i is None and not (mgr or asst):
                continue
            for r in rows[i + 1:]:
                teams = _split_list(_cell(r, team_i))
                if name_i is not None:  # one row per person
                    name = _cell(r, name_i)
                    if name:
                        add(name, _cell(r, role_i) or "Manager", teams, _cell(r, phone_i), _cell(r, email_i))
                else:  # one row per team
                    for j in mgr:
                        for name in _split_list(_cell(r, j)):
                            add(name, "Manager", teams)
                    for j in asst:
                        for name in _split_list(_cell(r, j)):
                            add(name, "Assistant manager", teams)
            if people:
                return list(people.values())
    raise ReportError(f"{os.path.basename(path)} does not look like a managers file. {STAFF_HELP}")


def write_staff_template(path: str) -> None:
    """Save an example managers file with instructions."""
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    ws = wb.active
    ws.title = "Managers"
    ws.append(["Name", "Role", "Team(s)", "Phone", "Email"])
    ws.append(["Alex Example", "Manager", "U12 Black", "07700 900010", "alex@example.com"])
    ws.append(["Pat Sample", "Assistant manager", "U12 Black, U10 Blue", "07700 900011", ""])
    ws.append(["Sam Demo", "Manager", "U8 Red", "", ""])
    for c in ws[1]:
        c.font = Font(bold=True)
    for col, w in zip("ABCDE", (22, 20, 30, 16, 28)):
        ws.column_dimensions[col].width = w
    notes = wb.create_sheet("How to fill in")
    for line in (
        "Replace the example rows with your own. Delete this sheet if you like.",
        "Name: the manager or assistant manager.",
        "Role: Manager or Assistant manager. Blank means Manager.",
        "Team(s): the team or teams they look after, separated by commas. Use the same names as the FA or Thrive, "
        "for example U12 Black.",
        "Phone and Email are optional.",
        "Alternative layout: one row per team with the columns Team, Manager and Assistant manager. "
        "Several names in one cell can be separated by commas.",
        "A CSV file with the same columns also works.",
        "This file contains personal data about adults. Keep it secure.",
    ):
        notes.append([line])
    notes.column_dimensions["A"].width = 110
    wb.save(path)


def attach_staff(result: Result, staff: List[Staff], team_map: Dict[str, Optional[str]]) -> None:
    """Match each person's teams to the team labels in the result and note anything that does not fit."""
    result.staff, result.staff_issues = {}, []
    if not staff:
        return
    prefix = result.club_prefix
    forms = {_team_form(label.replace(" (Thrive)", ""), ""): label for label in result.teams}
    via_thrive = {}
    for thrive_name, fa_name in team_map.items():  # a Thrive team name written in the managers file
        if fa_name:
            short = fa_name[len(prefix):].strip() if prefix and fa_name.startswith(prefix) else fa_name
            via_thrive[_team_form(thrive_name, "")] = short
    for person in staff:
        for text in person.teams:
            form = _team_form(text, prefix)
            label = forms.get(form) or (via_thrive.get(form) if via_thrive.get(form) in result.teams else None)
            if label is None:
                result.staff_issues.append(f"{person.name}: team '{text}' was not found in the FA or Thrive files")
            elif person not in result.staff.setdefault(label, []):
                result.staff[label].append(person)
    for label in team_labels(result):
        if not label.endswith("(Thrive)") and not any(p.kind == "manager" for p in result.staff.get(label, [])):
            result.staff_issues.append(f"Team {label} has no manager listed")


def staff_lines(result: Result, label: str) -> List[str]:
    """['Manager: A', 'Assistant managers: B, C'] for a team, or an empty list."""
    lines = []
    people = result.staff.get(label, [])
    for kind, title in (("manager", "Manager"), ("assistant", "Assistant manager"), ("other", "Other staff")):
        names = [p.name for p in people if p.kind == kind]
        if names:
            lines.append(f"{title}{'s' if len(names) > 1 and kind != 'other' else ''}: {', '.join(names)}")
    return lines


def staff_phones(result: Result, label: str, kind: str = "manager") -> str:
    """Phone numbers (digits only, ready to paste into WhatsApp search) for a team's managers or assistants."""
    numbers = [re.sub(r"[^\d+]", "", p.phone) for p in result.staff.get(label, []) if p.kind == kind and p.phone]
    return ", ".join(n for n in numbers if n)


# --------------------------------------------------------------------------- WhatsApp text

WHATSAPP_LIMIT = 3500  # characters per message part, so long teams are split into readable parts
SQUAD_FOOTNOTE = ("_Data protection: this message contains personal data about children (UK GDPR). Use it only to "
                  "run the team, do not forward or share it, keep it secure and delete it when no longer needed._")
MEDICAL_FOOTNOTE = ("_Data protection: this message contains children's medical information, which is special "
                    "category data under UK GDPR. Use it only to keep players safe, do not forward or share it, "
                    "keep it secure and delete it when no longer needed. It comes from Thrive and may be "
                    "incomplete._")


def _phone(text: str) -> str:
    out = []
    for part in _split_list(text.replace("/", ",")):
        digits = re.sub(r"\D", "", part)
        out.append(f"{digits[:5]} {digits[5:]}" if len(digits) == 11 and digits.startswith("0") else part)
    return ", ".join(out)


def _pack_messages(head: List[str], blocks: List[str], footnote: str) -> List[str]:
    """Fill messages with whole player blocks up to the length limit, repeating the heading on each."""
    fixed = len("\n".join(head)) + len(footnote) + 8
    parts: List[List[str]] = [[]]
    size = fixed
    for block in blocks:
        if parts[-1] and size + len(block) + 2 > WHATSAPP_LIMIT:
            parts.append([])
            size = fixed
        parts[-1].append(block)
        size += len(block) + 2
    messages = []
    for n, chunk in enumerate(parts, 1):
        heading = list(head)
        if len(parts) > 1:
            heading[0] += f" (part {n} of {len(parts)})"
        messages.append("\n".join(heading) + "\n\n" + "\n\n".join(chunk) + "\n\n" + footnote)
    return messages


def whatsapp_squad(result: Result, label: str, today: Optional[date] = None) -> List[str]:
    """WhatsApp-ready squad message(s): sign-up status, direct debit and contacts for each player."""
    today = today or date.today()
    members = result.teams.get(label, [])
    head = [f"*{label}* squad ({len(members)} players)"] + [f"_{x}_" for x in staff_lines(result, label)] \
        + [f"Updated {today:%d/%m/%Y}"]
    blocks = []
    for source, row in members:
        name, _dob, age = _name_dob(row, today)
        t = row.th.fields if row.th else {}
        f = row.fa.fields if row.fa else {}
        mark = lambda ok: "\u2705" if ok else "\u274c"  # noqa: E731  tick and cross
        lines = [f"*{name}*" + (f" ({age})" if age != "" else ""),
                 f"{_fa_mark(source)}  Thrive {mark(row.th is not None)}  "
                 f"Direct debit {mark(bool(row.th and row.th.mandate))}"]
        contact = " ".join(x for x in (t.get("account_owner") or t.get("pg_name") or f.get("parent_name", ""),
                                       _phone(t.get("owner_phone", ""))) if x)
        emergency = " ".join(x for x in (f.get("emergency", ""), _phone(f.get("emergency_phone", ""))) if x)
        if contact:
            lines.append(f"Contact: {contact}")
        if emergency and emergency != contact:
            lines.append(f"Emergency: {emergency}")
        blocks.append("\n".join(lines))
    return _pack_messages(head, blocks, SQUAD_FOOTNOTE)


def _not_paying(row: Row) -> bool:
    """Same rule as not_paying_report: no active Thrive mandate, or in the FA but not found in Thrive."""
    return (row.th is not None and not row.th.mandate) or row.result == "FA only"


def not_paying_by_team(result: Result) -> Dict[str, List[Tuple[str, Row]]]:
    """Not-paying players grouped by team label, in team order. Players in no team go under 'No team'."""
    out: Dict[str, List[Tuple[str, Row]]] = {}
    placed = set()
    for label in team_labels(result):
        members = [(src, row) for src, row in result.teams.get(label, []) if _not_paying(row)]
        if members:
            out[label] = members
            placed.update(id(row) for _src, row in members)
    loose = [(_source(row), row) for row in result.rows if _not_paying(row) and id(row) not in placed]
    if loose:
        out["No team"] = loose
    return out


NOT_PAYING_FOOTNOTE = ("_FA only players may be in Thrive under a different name: check before chasing. "
                       "This message contains personal data about children (UK GDPR): do not forward it and "
                       "delete it when no longer needed._")


def whatsapp_not_paying(result: Result, team: Optional[str] = None, today: Optional[date] = None) -> List[str]:
    """WhatsApp-ready not-paying list: each player's name, team, whether they are in the FA system and
    Thrive, and whether they have an active direct debit mandate. team=None means every team."""
    today = today or date.today()
    groups = not_paying_by_team(result)
    if team is not None:
        groups = {team: groups.get(team, [])}
    mark = lambda ok: "✅" if ok else "❌"  # noqa: E731  tick and cross
    blocks, total = [], 0
    for label, members in groups.items():
        lines = [f"*{label}*"]
        for source, row in members:
            name = row.fa_name or row.thrive_name
            lines.append(f"{name} ({label})\n   {_fa_mark(source)}  Thrive {mark(row.th is not None)}  "
                         f"Active mandate {mark(bool(row.th and row.th.mandate))}")
            total += 1
        if len(lines) == 1:
            lines.append("Everyone in this team is paying through Thrive.")
        blocks.append("\n".join(lines))
    title = "*Not paying through Thrive*" + (f": {team}" if team else "")
    head = [title, f"{total} player(s)", f"Updated {today:%d/%m/%Y}"]
    return _pack_messages(head, blocks, NOT_PAYING_FOOTNOTE)


def whatsapp_medical(result: Result, label: str, today: Optional[date] = None) -> List[str]:
    """WhatsApp-ready medical alert message(s): only players with medical information recorded."""
    today = today or date.today()
    members = result.teams.get(label, [])
    blocks = []
    for _source, row in members:
        t = row.th.fields if row.th else {}
        if _medical_values(row)[0] != "Yes":
            continue
        name, _dob, age = _name_dob(row, today)
        lines = [f"*{name}*" + (f" ({age})" if age != "" else "")]
        for title, key in (("Medical", "conditions"), ("Medicines", "medicines"), ("Allergies", "allergies"),
                           ("Behavioural", "behavioural"), ("Disabilities", "disabilities"),
                           ("Other", "other"), ("Notes", "notes")):
            if _meaningful(t.get(key, "")):
                lines.append(f"{title}: {t[key]}")
        if len(lines) == 1:
            lines.append("Medical conditions recorded but no details given")
        blocks.append("\n".join(lines))
    head = [f"*{label}* medical alerts",
            f"{len(blocks)} of {len(members)} players have medical information recorded", f"Updated {today:%d/%m/%Y}"]
    if not blocks:
        blocks = ["No medical information is recorded for this team."]
    return _pack_messages(head, blocks, MEDICAL_FOOTNOTE)


# --------------------------------------------------------------------------- Excel export

COLUMNS = [
    ("Result", "result", 24), ("Match", "confidence", 18), ("Issue", "issue", 60), ("Data quality", "dq", 60),
    ("FAN ID", "fan_id", 12), ("FA name", "fa_name", 24), ("Thrive name", "thrive_name", 24),
    ("FA DOB", "fa_dob", 12), ("Thrive DOB", "thrive_dob", 12),
    ("FA team(s)", "fa_teams", 22), ("Thrive team(s)", "thrive_teams", 30),
    ("Thrive mapped to", "expected_fa_teams", 22), ("FA status", "fa_status", 14),
    ("Thrive mandate", "mandate", 18),
]
_FILLS = {"ok": "E2F0D9", "warn": "FFF2CC", "bad": "F8CBAD", "info": "EDEDED"}


def _sheet_name(wb, base: str) -> str:
    name = re.sub(r"[\[\]:*?/\\]", "", base).strip()[:31] or "Sheet"
    candidate, n = name, 2
    while candidate in wb.sheetnames:
        suffix = f" {n}"
        candidate, n = name[:31 - len(suffix)] + suffix, n + 1
    return candidate


def _write_table(ws, headers, rows, title_lines=(), fill_cols=None):
    """rows: [(values, fill_hex or None)]. Writes optional title lines, then a filtered header+table."""
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    r = 1
    for i, line in enumerate(title_lines):
        ws.cell(r, 1, line).font = Font(bold=(i == 0), size=14 if i == 0 else 10,
                                        color="C00000" if line.startswith("CONFIDENTIAL") else "000000")
        r += 1
    if title_lines:
        r += 1
    hdr = r
    for j, title in enumerate(headers, 1):
        c = ws.cell(hdr, j, title)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="305496")
        c.alignment = Alignment(wrap_text=True, vertical="top")
    widths = [len(h) for h in headers]
    for i, (values, fill) in enumerate(rows, hdr + 1):
        for j, v in enumerate(values, 1):
            c = ws.cell(i, j, v)
            if isinstance(v, date):
                c.number_format = "dd/mm/yyyy"
                c.alignment = Alignment(horizontal="left")
            if fill and (fill_cols is None or j <= fill_cols):
                c.fill = PatternFill("solid", fgColor=fill)
            widths[j - 1] = max(widths[j - 1], min(len(str(v)), 60) if v not in (None, "") else 0)
    for j, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(j)].width = max(8, min(w + 2, 62))
    ws.freeze_panes = ws.cell(hdr + 1, 2)
    ws.auto_filter.ref = f"A{hdr}:{get_column_letter(len(headers))}{max(hdr + len(rows), hdr + 1)}"


def _result_rows(rows):
    return [([getattr(r, a) for _, a, _ in COLUMNS], _FILLS[r.level]) for r in rows]


def _team_title(label, rows, staff=()):
    counts = Counter(src for _, src in rows)
    return [f"Team: {label}", *staff, f"Generated {datetime.now():%d/%m/%Y %H:%M}",
            f"{len(rows)} players   |   Both: {counts['Both']}   FA only: {counts['FA only']}   "
            f"Thrive only: {counts['Thrive only']}" + (f"   No FA needed: {counts[NO_FA]}" if counts[NO_FA] else ""),
            "Colour key: green = in both FA and Thrive, orange = FA only, blue = Thrive only, "
            "grey = Thrive group with no FA team (only the mandate is checked)", CONFIDENTIAL]


def export_xlsx(path: str, result: Result, team_map: Dict[str, Optional[str]],
                fa_file: str = "", thrive_file: str = "", include_medical: bool = True) -> None:
    """One workbook: summary, every results tab, not paying, a sheet per team and the team mapping."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = "Player reconciliation: FA registration vs Thrive"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A3"], ws["B3"] = "Run", datetime.now().strftime("%d/%m/%Y %H:%M")
    ws["A4"], ws["B4"] = "FA report", os.path.basename(fa_file)
    ws["A5"], ws["B5"] = "Thrive export", os.path.basename(thrive_file)
    ws["A6"], ws["B6"] = "Medical data included", "Yes" if include_medical else "No"
    ws["A7"], ws["B7"] = "App version", __version__
    counts = result.counts()
    r = 9
    ws.cell(r, 1, "Result").font = Font(bold=True)
    ws.cell(r, 2, "Players").font = Font(bold=True)
    for name in LEVELS:
        r += 1
        ws.cell(r, 1, name).fill = PatternFill("solid", fgColor=_FILLS[LEVELS[name]])
        ws.cell(r, 2, counts.get(name, 0))
    ws.cell(r + 2, 1, "Rows with data quality flags")
    ws.cell(r + 2, 2, sum(1 for x in result.rows if x.dq))
    np_headers, np_rows = not_paying_report(result)
    ws.cell(r + 3, 1, "Not paying (no mandate / not in Thrive)")
    ws.cell(r + 3, 2, len(np_rows))
    ws.cell(r + 5, 1, "Teams").font = Font(bold=True)
    ws.cell(r + 5, 2, "Players").font = Font(bold=True)
    if result.staff:
        ws.cell(r + 5, 3, "Manager(s) and assistants").font = Font(bold=True)
    for i, label in enumerate(team_labels(result), r + 6):
        ws.cell(i, 1, label)
        ws.cell(i, 2, len(result.teams[label]))
        if result.staff:
            ws.cell(i, 3, "   ".join(staff_lines(result, label)))
    end = r + 7 + len(result.teams)
    for note in result.staff_issues:
        ws.cell(end, 1, "Managers file: " + note)
        end += 1
    ws.cell(end + 1, 1, CONFIDENTIAL).font = Font(color="C00000")
    ws.column_dimensions["C"].width = 60
    ws.column_dimensions["A"].width = 38
    ws.column_dimensions["B"].width = 40

    for title, pred in RESULT_TABS[1:] + RESULT_TABS[:1]:  # "All" last of the results tabs
        _write_table(wb.create_sheet(_sheet_name(wb, title)), [c[0] for c in COLUMNS],
                     _result_rows([x for x in result.rows if pred(x)]), fill_cols=4)
        if title == "Data quality":
            _write_table(wb.create_sheet(_sheet_name(wb, "Not paying")), np_headers,
                         [(v, SOURCE_FILLS[src]) for v, src in np_rows], [
                             "Not paying: no active mandate or not in Thrive", NOT_PAYING_NOTE, CONFIDENTIAL])
    for label in team_labels(result):
        headers, rows = team_report(result, label, include_medical)
        _write_table(wb.create_sheet(_sheet_name(wb, f"Team {label}")), headers,
                     [(v, SOURCE_FILLS[src]) for v, src in rows],
                     _team_title(label, rows, staff_lines(result, label)), fill_cols=7)

    ms = wb.create_sheet("Team mapping")
    ms.append(["Thrive team", "FA team"])
    for cell in ms[1]:
        cell.font = Font(bold=True)
    for k in sorted(team_map):
        ms.append([k, team_map[k] if team_map[k] is not IGNORE else "(ignore)"])
    ms.column_dimensions["A"].width = 24
    ms.column_dimensions["B"].width = 40
    wb.save(path)


def _team_workbook(result: Result, label: str, include_medical: bool):
    from openpyxl import Workbook
    wb = Workbook()
    headers, rows = team_report(result, label, include_medical)
    wb.active.title = _sheet_name(wb, f"Team {label}")
    _write_table(wb.active, headers, [(v, SOURCE_FILLS[src]) for v, src in rows],
                 _team_title(label, rows, staff_lines(result, label)), fill_cols=7)
    return wb


def export_team_xlsx(path: str, result: Result, label: str, include_medical: bool = True) -> None:
    _team_workbook(result, label, include_medical).save(path)


def export_each_team(folder: str, result: Result, include_medical: bool = True) -> List[str]:
    """One file per team, so each manager only receives their own players."""
    paths = []
    for label in team_labels(result):
        name = re.sub(r"[^\w\- ]+", "", label).strip().replace(" ", "_")
        path = os.path.join(folder, f"Team_{name}.xlsx")
        export_team_xlsx(path, result, label, include_medical)
        paths.append(path)
    return paths


def export_not_paying_xlsx(path: str, result: Result) -> None:
    from openpyxl import Workbook
    wb = Workbook()
    wb.active.title = "Not paying"
    headers, rows = not_paying_report(result)
    _write_table(wb.active, headers, [(v, SOURCE_FILLS[src]) for v, src in rows],
                 ["Not paying: no active mandate or not in Thrive", NOT_PAYING_NOTE, CONFIDENTIAL])
    wb.save(path)
