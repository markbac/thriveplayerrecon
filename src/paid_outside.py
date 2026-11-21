"""Players marked as paying outside Thrive: either they normally pay the club directly (cash, bank transfer) or they
have already paid in full for the season. Marked players count as paying: they are not on the Not paying list or in
the not paying WhatsApp messages, and show as paying on the team sheets and in the club PDF. They stay in the results
and team sheets, and the FA registration checks are unchanged.

Marks are remembered as one-way codes (SHA-256 of the FAN ID, or of the name and date of birth when there is no FAN
ID) with the kind and the date marked, so the settings file holds no names or FAN IDs. web/src/club_data.ts mirrors
this module and produces the same codes. Kept apart from reconcile_core, which only reads Row.paid_outside."""
import hashlib
import re
from datetime import date
from typing import Dict, List, Optional

import left_club
import reconcile_core as rc

_SALT = "PlayerReconcile-paid-v1|"
KINDS = {"direct": rc.PAID_DIRECT, "full": rc.PAID_IN_FULL}
PAID_NOTE = ("Players marked as paying outside Thrive: they pay the club directly, or have already paid in full. "
             "They count as paying, so they are not on the Not paying list or in the not paying WhatsApp messages. "
             "Clear a mark when it no longer applies (for example a new season).")


def paid_id(row: rc.Row) -> str:
    return hashlib.sha256((_SALT + left_club.left_key(row)).encode("utf-8")).hexdigest()


def clean_marks(raw) -> List[Dict[str, str]]:
    """Valid marks only: [{'id': 64 hex characters, 'kind': 'direct' or 'full', 'marked': 'YYYY-MM-DD'}]."""
    out, seen = [], set()
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        mid = str(item.get("id", "")).lower()
        kind = str(item.get("kind", ""))
        marked = str(item.get("marked", ""))
        if re.fullmatch(r"[0-9a-f]{64}", mid) and kind in KINDS and mid not in seen:
            seen.add(mid)
            out.append({"id": mid, "kind": kind,
                        "marked": marked if re.fullmatch(r"\d{4}-\d{2}-\d{2}", marked) else ""})
    return out


def mark(marks: List[Dict[str, str]], row: rc.Row, kind: str, today: Optional[date] = None) -> List[Dict[str, str]]:
    """Mark the player (replacing any earlier mark of the other kind)."""
    if kind not in KINDS:
        raise ValueError(kind)
    mid = paid_id(row)
    return [m for m in marks if m["id"] != mid] + [{"id": mid, "kind": kind,
                                                    "marked": (today or date.today()).isoformat()}]


def unmark(marks: List[Dict[str, str]], row: rc.Row) -> List[Dict[str, str]]:
    mid = paid_id(row)
    return [m for m in marks if m["id"] != mid]


def kind_of(marks: List[Dict[str, str]], row: rc.Row) -> str:
    mid = paid_id(row)
    return next((m["kind"] for m in marks if m["id"] == mid), "")


def apply_paid(result: rc.Result, marks: List[Dict[str, str]]) -> List[rc.Row]:
    """Set Row.paid_outside on the marked players. Returns the marked players, for the Paid outside Thrive list."""
    kinds = {m["id"]: m["kind"] for m in marks}
    found = []
    for r in result.rows:
        r.paid_outside = KINDS.get(kinds.get(paid_id(r), ""), "")
        if r.paid_outside:
            found.append(r)
            if r.paid_outside == rc.PAID_IN_FULL and r.th is not None:
                r.mandate = rc._mandate_text(r)  # the Results table shows them as set up in Thrive
    return found


def unmatched_marks(marks: List[Dict[str, str]], paid_rows: List[rc.Row]) -> int:
    """Marks for players not in the files any more: safe to clear."""
    found = {paid_id(r) for r in paid_rows}
    return sum(1 for m in marks if m["id"] not in found)


PAID_HEADERS = ["Player", "DOB", "Age", "Team(s)", "Paying", "In Thrive", "Thrive mandate", "Marked"]


def paid_rows_table(paid_rows: List[rc.Row], marks: List[Dict[str, str]], today: Optional[date] = None):
    """(headers, [values]) for the Paid outside Thrive list."""
    today = today or date.today()
    when = {m["id"]: m["marked"] for m in marks}
    rows = []
    for r in paid_rows:
        name, dob, age = rc._name_dob(r, today)
        marked = when.get(paid_id(r), "")
        marked = "/".join(reversed(marked.split("-"))) if marked else ""
        rows.append([name, dob, age, r.fa_teams or r.thrive_teams or r.expected_fa_teams, r.paid_outside,
                     "Yes" if r.th else "No", "Not in Thrive" if not r.th else (r.th.mandate or "None"), marked])
    rows.sort(key=lambda v: (str(v[3]).lower(), str(v[0]).split()[-1].lower() if v[0] else ""))
    return PAID_HEADERS, rows
