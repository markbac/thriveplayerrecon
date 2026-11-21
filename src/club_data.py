"""Club data kept by the app between runs: players marked as left the club (one-way hashes) and notes on coaches
(kept against a one-way hash of the coach's FAN ID, so no names or FAN IDs are stored). It can be moved between
computers in an encrypted file: AES-256-GCM with a key from the passphrase (PBKDF2-SHA256), the same format as the
web app (web/src/club_data.ts), so either app can open the other's file. Nothing is sent anywhere."""
import base64
import hashlib
import json
import os
import re
from datetime import date
from typing import Dict, List, Optional

import left_club
import paid_outside

FORMAT = "PlayerReconcile club data"
VERSION = 1
ITERATIONS = 310_000
_COACH_SALT = "PlayerReconcile-coach-v1|"
MAX_NOTE = 2000


class ClubDataError(Exception):
    """The file is not a club data file, or the passphrase is wrong."""


def coach_id(coach) -> str:
    """One-way code for a coach: SHA-256 of their FAN ID (or name when there is none)."""
    digits = re.sub(r"\D", "", coach.fan or "")
    key = "fan:" + digits if digits else "name:" + " ".join(coach.name.lower().split())
    return hashlib.sha256((_COACH_SALT + key).encode("utf-8")).hexdigest()


def clean_notes(raw) -> Dict[str, Dict[str, str]]:
    """{coach id: {'note': text, 'updated': 'YYYY-MM-DD'}} with blank notes and bad entries dropped."""
    out = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        if not (isinstance(key, str) and re.fullmatch(r"[0-9a-f]{64}", key) and isinstance(value, dict)):
            continue
        note = str(value.get("note", "")).strip()[:MAX_NOTE]
        updated = str(value.get("updated", ""))
        if note:
            out[key] = {"note": note, "updated": updated if re.fullmatch(r"\d{4}-\d{2}-\d{2}", updated) else ""}
    return out


def set_note(notes: Dict[str, Dict[str, str]], coach, text: str,
             today: Optional[date] = None) -> Dict[str, Dict[str, str]]:
    notes = dict(notes)
    text = text.strip()[:MAX_NOTE]
    if text:
        notes[coach_id(coach)] = {"note": text, "updated": (today or date.today()).isoformat()}
    else:
        notes.pop(coach_id(coach), None)
    return notes


def note_for(notes: Dict[str, Dict[str, str]], coach) -> str:
    return notes.get(coach_id(coach), {}).get("note", "")


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text or "")


def import_file_notes(notes: Dict[str, Dict[str, str]], officials, coaches,
                      today: Optional[date] = None) -> tuple:
    """Notes from the officials file's Notes column, matched to coaches by FAN ID (or by name). A file note is
    only taken when the app has no note for that coach, so an older file never overwrites a newer note.
    Returns (notes, how many were taken)."""
    import coaches as co
    notes = dict(notes)
    taken = 0
    for o in officials:
        text = (getattr(o, "note", "") or "").strip()
        if not text:
            continue
        coach = next((c for c in coaches if _digits(o.fan) and _digits(o.fan) == _digits(c.fan)), None) \
            or next((c for c in coaches if o.name and co.same_person(c.name, o.name)), None)
        if coach is not None and coach_id(coach) not in notes:
            notes[coach_id(coach)] = {"note": text[:MAX_NOTE], "updated": (today or date.today()).isoformat()}
            taken += 1
    return notes, taken


def merge(current: dict, incoming: dict) -> dict:
    """Combine club data: every left-the-club mark from both, the newer paid outside Thrive mark for each player,
    and for each coach the newer note."""
    marks = left_club.clean_marks(current.get("left_players"))
    known = {m["id"] for m in marks}
    marks += [m for m in left_club.clean_marks(incoming.get("left_players")) if m["id"] not in known]
    notes = clean_notes(current.get("coach_notes"))
    for key, value in clean_notes(incoming.get("coach_notes")).items():
        if key not in notes or value["updated"] >= notes[key]["updated"]:
            notes[key] = value
    paid = {m["id"]: m for m in paid_outside.clean_marks(current.get("paid_outside"))}
    for m in paid_outside.clean_marks(incoming.get("paid_outside")):
        if m["id"] not in paid or m["marked"] >= paid[m["id"]]["marked"]:
            paid[m["id"]] = m
    return {"left_players": marks, "coach_notes": notes, "paid_outside": list(paid.values())}


def _key(passphrase: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), salt, ITERATIONS, 32)


def export_encrypted(data: dict, passphrase: str) -> bytes:
    """The club data as an encrypted JSON file (only the format name and settings are readable)."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if len(passphrase) < 8:
        raise ClubDataError("Use a passphrase of at least 8 characters.")
    payload = {"left_players": left_club.clean_marks(data.get("left_players")),
               "coach_notes": clean_notes(data.get("coach_notes")),
               "paid_outside": paid_outside.clean_marks(data.get("paid_outside")),
               "exported": date.today().isoformat()}
    salt, iv = os.urandom(16), os.urandom(12)
    sealed = AESGCM(_key(passphrase, salt)).encrypt(iv, json.dumps(payload).encode("utf-8"), FORMAT.encode())
    b64 = lambda b: base64.b64encode(b).decode("ascii")  # noqa: E731
    return json.dumps({"format": FORMAT, "version": VERSION, "kdf": "PBKDF2-SHA256", "iterations": ITERATIONS,
                       "cipher": "AES-256-GCM", "salt": b64(salt), "iv": b64(iv), "data": b64(sealed)},
                      indent=2).encode("utf-8")


def import_encrypted(blob: bytes, passphrase: str) -> dict:
    """Open an encrypted club data file: {'left_players': [...], 'coach_notes': {...}, 'paid_outside': [...]}.
    Files from before paid outside Thrive marks existed open with none."""
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    try:
        outer = json.loads(blob.decode("utf-8-sig"))
        if outer.get("format") != FORMAT:
            raise ValueError
        salt, iv, sealed = (base64.b64decode(outer[k]) for k in ("salt", "iv", "data"))
        iterations = int(outer.get("iterations", ITERATIONS))
    except (ValueError, KeyError, TypeError, AttributeError):
        raise ClubDataError("This is not a club data file from this app.") from None
    try:
        key = hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), salt, iterations, 32)
        inner = json.loads(AESGCM(key).decrypt(iv, sealed, FORMAT.encode()).decode("utf-8"))
    except (InvalidTag, ValueError):
        raise ClubDataError("Wrong passphrase, or the file is damaged.") from None
    return {"left_players": left_club.clean_marks(inner.get("left_players")),
            "coach_notes": clean_notes(inner.get("coach_notes")),
            "paid_outside": paid_outside.clean_marks(inner.get("paid_outside"))}


def notes_list(notes: Dict[str, Dict[str, str]], coaches) -> List[tuple]:
    """(coach, note) for the coaches in this report who have a note."""
    return [(c, notes[coach_id(c)]["note"]) for c in coaches if coach_id(c) in notes]
