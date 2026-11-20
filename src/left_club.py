"""Players who have left the club but are still in the FA report (until they are released in the Whole Game
System). Marked players are taken out of the results, team sheets, not paying list, counts, WhatsApp messages and
the club PDF, and listed on the Left the club tab instead.

Marks are remembered as one-way codes (SHA-256 of the FAN ID, or of the name and date of birth when there is no
FAN ID) with the date marked, so the settings file holds no names or FAN IDs. web/src/left_club.ts mirrors this
module and produces the same codes. Kept apart from reconcile_core, so the player reconciliation is unchanged."""
import hashlib
import re
from datetime import date
from typing import Dict, List, Optional

import reconcile_core as rc

_SALT = "PlayerReconcile-left-v1|"
LEFT_NOTE = ("Players marked as left the club. They are left out of the results, team sheets, the not paying list, "
             "counts and the club PDF. Release them in the Whole Game System (Players > select the player > Release) "
             "so they drop off the FA report, then unmark them here.")


def left_key(row: rc.Row) -> str:
    """'fan:1234567', or 'name:amy able|2015-02-01' for a player with no FAN ID."""
    fan = (row.fa.fan_id if row.fa else "") or row.fan_id
    if fan:
        digits = re.sub(r"\D", "", str(fan))
        return "fan:" + (digits or str(fan).strip())
    name = " ".join((row.fa_name or row.thrive_name).lower().split())
    dob = row.fa_dob or row.thrive_dob
    return f"name:{name}|{dob.isoformat() if dob else ''}"


def left_id(row: rc.Row) -> str:
    return hashlib.sha256((_SALT + left_key(row)).encode("utf-8")).hexdigest()


def clean_marks(raw) -> List[Dict[str, str]]:
    """Valid marks only: [{'id': 64 hex characters, 'marked': 'YYYY-MM-DD'}], no repeats."""
    out, seen = [], set()
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        mid = str(item.get("id", "")).lower()
        marked = str(item.get("marked", ""))
        if re.fullmatch(r"[0-9a-f]{64}", mid) and mid not in seen:
            seen.add(mid)
            out.append({"id": mid, "marked": marked if re.fullmatch(r"\d{4}-\d{2}-\d{2}", marked) else ""})
    return out


def mark(marks: List[Dict[str, str]], row: rc.Row, today: Optional[date] = None) -> List[Dict[str, str]]:
    mid = left_id(row)
    if any(m["id"] == mid for m in marks):
        return marks
    return marks + [{"id": mid, "marked": (today or date.today()).isoformat()}]


def unmark(marks: List[Dict[str, str]], row: rc.Row) -> List[Dict[str, str]]:
    mid = left_id(row)
    return [m for m in marks if m["id"] != mid]


def apply_left(result: rc.Result, marks: List[Dict[str, str]]) -> List[rc.Row]:
    """Take the marked players out of result.rows and result.teams (teams left empty are dropped). Returns the
    players taken out, for the Left the club list."""
    ids = {m["id"] for m in marks}
    if not ids:
        return []
    gone = [r for r in result.rows if left_id(r) in ids]
    if not gone:
        return []
    gone_ids = {id(r) for r in gone}
    result.rows = [r for r in result.rows if id(r) not in gone_ids]
    for label in list(result.teams):
        result.teams[label] = [(s, r) for s, r in result.teams[label] if id(r) not in gone_ids]
        if not result.teams[label]:
            del result.teams[label]
    return gone


def unmatched_marks(marks: List[Dict[str, str]], left_rows: List[rc.Row]) -> int:
    """Marks for players not in the files any more (released in the FA system): safe to clear."""
    found = {left_id(r) for r in left_rows}
    return sum(1 for m in marks if m["id"] not in found)


LEFT_HEADERS = ["Player", "DOB", "Age", "Team(s)", "FAN ID", "FA status", "In Thrive", "Marked as left"]


def left_rows_table(left_rows: List[rc.Row], marks: List[Dict[str, str]], today: Optional[date] = None):
    """(headers, [values]) for the Left the club list."""
    today = today or date.today()
    when = {m["id"]: m["marked"] for m in marks}
    rows = []
    for r in left_rows:
        name, dob, age = rc._name_dob(r, today)
        marked = when.get(left_id(r), "")
        marked = "/".join(reversed(marked.split("-"))) if marked else ""
        rows.append([name, dob, age, r.fa_teams or r.thrive_teams or r.expected_fa_teams,
                     (r.fa.fan_id if r.fa else "") or r.fan_id, r.fa_status or ("Not in the FA report" if not r.fa
                                                                                  else ""),
                     "Yes" if r.th else "No", marked])
    rows.sort(key=lambda v: (str(v[3]).lower(), str(v[0]).split()[-1].lower() if v[0] else ""))
    return LEFT_HEADERS, rows
