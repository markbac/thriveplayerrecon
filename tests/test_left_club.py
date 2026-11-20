"""Players marked as left the club (invented data only)."""
import json

from conftest import rc, reconcile_in_app, row_for

import club_pdf
import left_club


def test_marks_are_hashes_not_names(result):
    dan = row_for(result, "Dan Dee")  # FA only, so on the not paying list
    marks = left_club.mark([], dan)
    assert len(marks) == 1 and len(marks[0]["id"]) == 64
    stored = json.dumps(marks)
    assert "Dan" not in stored and "Dee" not in stored and "1005" not in stored
    assert left_club.left_key(dan) == "fan:1005"
    assert left_club.mark(marks, dan) == marks  # marking twice keeps one mark
    assert left_club.unmark(marks, dan) == []


def test_marked_player_is_left_out_everywhere(result):
    dan = row_for(result, "Dan Dee")
    marks = left_club.mark([], dan)
    _h, before = rc.not_paying_report(result)
    assert "Dan Dee" in [v[0] for v, _s in before]
    gone = left_club.apply_left(result, marks)
    assert [r.fa_name for r in gone] == ["Dan Dee"]
    assert dan not in result.rows
    assert all(r is not dan for members in result.teams.values() for _s, r in members)
    _h, after = rc.not_paying_report(result)
    assert "Dan Dee" not in [v[0] for v, _s in after]
    assert rc.unpaid_count(result, "U12 Black") == 0
    teams = club_pdf.club_summary(result)
    assert "Dan Dee" not in [p[0] for t in teams for p in t.players]
    headers, rows = left_club.left_rows_table(gone, marks)
    assert rows[0][0] == "Dan Dee" and rows[0][headers.index("FAN ID")] == "1005"


def test_unmatched_and_bad_marks():
    assert left_club.clean_marks([{"id": "x"}, "junk", {"id": "a" * 64, "marked": "2026-11-20"},
                                  {"id": "A" * 64}]) == [{"id": "a" * 64, "marked": "2026-11-20"}]
    assert left_club.clean_marks(None) == []
    assert left_club.unmatched_marks([{"id": "a" * 64, "marked": ""}], []) == 1


def test_mark_and_unmark_in_the_app(app_factory, fa_path, thrive_path, monkeypatch):
    a = app_factory()
    reconcile_in_app(a, fa_path, thrive_path)
    monkeypatch.setattr(a.__class__, "_row_from_table", lambda self, tree: row_for(self.result, "Dan Dee")
                        if tree is not self.left_tree else self.result.left_rows[0])
    import app as appmod
    monkeypatch.setattr(appmod.messagebox, "askyesno", lambda *a_, **k: True)
    a.mark_left(a.np_tree)
    assert len(a.cfg["left_players"]) == 1
    assert "Dan Dee" not in [r.fa_name for r in a.result.rows]
    assert [r.fa_name for r in a.result.left_rows] == ["Dan Dee"]
    assert len(a.left_tree.get_children()) == 1
    assert "Dan" not in json.dumps(a.cfg["left_players"])
    a.unmark_left()
    assert a.cfg["left_players"] == [] and "Dan Dee" in [r.fa_name for r in a.result.rows]
