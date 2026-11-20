"""Coach notes and the encrypted club data file (invented data only)."""
import json
import os
from datetime import date

import pytest
from conftest import row_for

import club_data
import coaches as co
import left_club

VECTOR = os.path.join(os.path.dirname(__file__), "parity", "club_data_vector.prdata")
VECTOR_PASSPHRASE = "correct horse battery"


def _coach(name="Jo Sample", fan="101"):
    return co.Coach(fan, name)


def test_notes_are_kept_against_a_hash():
    notes = club_data.set_note({}, _coach(), "  First Aid course booked for 12/01  ", date(2026, 11, 20))
    assert club_data.note_for(notes, _coach()) == "First Aid course booked for 12/01"
    stored = json.dumps(notes)
    assert "Jo" not in stored and "101" not in stored and len(next(iter(notes))) == 64
    assert club_data.coach_id(_coach()) == club_data.coach_id(_coach("Joanne Sample", "101"))  # by FAN ID
    assert club_data.set_note(notes, _coach(), "   ") == {}  # a blank note removes it


def test_merge_keeps_every_mark_and_the_newer_note(result):
    dan = row_for(result, "Dan Dee")
    mine = {"left_players": left_club.mark([], dan, date(2026, 11, 1)),
            "coach_notes": club_data.set_note({}, _coach(), "old", date(2026, 11, 1))}
    theirs = {"left_players": left_club.mark([], row_for(result, "Ben Bold"), date(2026, 11, 2)),
              "coach_notes": club_data.set_note({}, _coach(), "new", date(2026, 11, 5))}
    merged = club_data.merge(mine, theirs)
    assert len(merged["left_players"]) == 2
    assert club_data.note_for(merged["coach_notes"], _coach()) == "new"


def test_encrypted_round_trip_hides_everything(result):
    data = {"left_players": left_club.mark([], row_for(result, "Dan Dee")),
            "coach_notes": club_data.set_note({}, _coach(), "DBS renewal started")}
    blob = club_data.export_encrypted(data, "a long passphrase")
    text = blob.decode()
    assert "DBS renewal" not in text and data["left_players"][0]["id"] not in text
    assert json.loads(text)["format"] == club_data.FORMAT
    back = club_data.import_encrypted(blob, "a long passphrase")
    assert back["left_players"] == data["left_players"] and back["coach_notes"] == data["coach_notes"]
    with pytest.raises(club_data.ClubDataError, match="Wrong passphrase"):
        club_data.import_encrypted(blob, "not the passphrase")
    with pytest.raises(club_data.ClubDataError, match="not a club data file"):
        club_data.import_encrypted(b'{"hello": 1}', "a long passphrase")
    with pytest.raises(club_data.ClubDataError, match="at least 8"):
        club_data.export_encrypted(data, "short")


def test_web_app_vector_opens():
    """The vector was written by this module; the web tests open the same file, so either app reads the other's."""
    back = club_data.import_encrypted(open(VECTOR, "rb").read(), VECTOR_PASSPHRASE)
    assert back["coach_notes"][club_data.coach_id(_coach())]["note"] == "Safeguarding course booked"
    assert back["left_players"][0]["id"] == left_club.left_id(_FakeRow())


class _FakeRow:
    """Just enough of a reconciliation row for left_id: FAN ID 1005."""
    fan_id, fa_name, thrive_name, fa_dob, thrive_dob = "1005", "Dan Dee", "", None, None

    class fa:  # noqa: N801
        fan_id = "1005"
