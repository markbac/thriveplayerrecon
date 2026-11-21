"""Players marked as paying outside Thrive (invented data only)."""
import json

from conftest import rc, reconcile_in_app, row_for

import club_data
import club_pdf
import paid_outside


def _team_of(result, row):
    return next(label for label, members in result.teams.items() if any(r is row for _s, r in members))


def test_marks_are_hashes_not_names(result):
    ben = row_for(result, "Ben Bold")
    marks = paid_outside.mark([], ben, "direct")
    stored = json.dumps(marks)
    assert len(marks[0]["id"]) == 64 and "Ben" not in stored and "Bold" not in stored and "1002" not in stored
    assert paid_outside.paid_id(ben) != __import__("left_club").left_id(ben)  # not the same code as left the club
    marks = paid_outside.mark(marks, ben, "full")  # marking again replaces the kind
    assert len(marks) == 1 and paid_outside.kind_of(marks, ben) == "full"
    assert paid_outside.unmark(marks, ben) == []


def test_paid_in_full_looks_exactly_like_an_active_mandate(result):
    ben, amy = row_for(result, "Ben Bold"), row_for(result, "Amy Able")  # Ben has no mandate, Amy has
    label = _team_of(result, ben)
    _h, before = rc.not_paying_report(result)
    assert "Ben Bold" in [v[0] for v, _s in before]
    found = paid_outside.apply_paid(result, paid_outside.mark([], ben, "full"))
    assert found == [ben]
    _h, after = rc.not_paying_report(result)
    assert "Ben Bold" not in [v[0] for v, _s in after]
    assert rc.paying_status(ben) == rc.paying_status(amy) == "Yes"
    assert rc.paying_label(rc.paying_status(ben)) == "✔ Yes"
    assert rc._mandate_mark(ben) == rc._mandate_mark(amy) == "✅"
    assert ben.mandate == "Active"
    headers, rows = rc.team_report(result, label)
    by_name = {v[0]: dict(zip(headers, v)) for v, _s in rows}
    for col in ("Thrive mandate", "Paying through Thrive"):
        assert by_name["Ben Bold"][col] == by_name["Amy Able"][col]
    squad = rc.whatsapp_squad_list(result, label)
    assert "paid in full" not in squad.lower() and "Direct debit: 4 active, 0 without" in squad
    assert "Ben Bold" not in "\n".join(rc.whatsapp_not_paying(result))
    assert rc.unpaid_count(result, label) == 0
    pdf_ben = next(p for t in club_pdf.club_summary(result) for p in t.players if p[0] == "Ben Bold")
    assert pdf_ben[-1] == "Yes"


def test_pays_the_club_directly_is_shown(result):
    dan = row_for(result, "Dan Dee")  # FA only, not in Thrive
    paid_outside.apply_paid(result, paid_outside.mark([], dan, "direct"))
    assert rc.paying_status(dan) == "Yes (pays the club directly)"
    assert "Dan Dee" not in [v[0] for v, _s in rc.not_paying_report(result)[1]]
    assert dan.result == "FA only"  # the FA reconciliation is unchanged
    headers, rows = paid_outside.paid_rows_table([dan], paid_outside.mark([], dan, "direct"))
    assert rows[0][0] == "Dan Dee" and rows[0][headers.index("Paying")] == rc.PAID_DIRECT


def test_bad_marks_and_club_data_round_trip(result):
    assert paid_outside.clean_marks([{"id": "a" * 64, "kind": "other"}, {"id": "b" * 64, "kind": "full",
                                                                         "marked": "2026-11-21"}, "junk"]) \
        == [{"id": "b" * 64, "kind": "full", "marked": "2026-11-21"}]
    marks = paid_outside.mark([], row_for(result, "Ben Bold"), "full")
    blob = club_data.export_encrypted({"left_players": [], "coach_notes": {}, "paid_outside": marks}, "passphrase1")
    back = club_data.import_encrypted(blob, "passphrase1")
    assert back["paid_outside"] == marks
    merged = club_data.merge({"paid_outside": []}, back)
    assert merged["paid_outside"] == marks


def test_mark_and_unmark_in_the_app(app_factory, fa_path, thrive_path, monkeypatch):
    a = app_factory()
    reconcile_in_app(a, fa_path, thrive_path)
    monkeypatch.setattr(a.__class__, "_row_from_table", lambda self, tree: row_for(self.result, "Ben Bold"))
    import app as appmod
    monkeypatch.setattr(appmod.messagebox, "askyesno", lambda *a_, **k: True)
    a.mark_paid(a.np_tree, "full")
    assert len(a.cfg["paid_outside"]) == 1 and "Ben" not in json.dumps(a.cfg["paid_outside"])
    assert "Ben Bold" not in [a.np_tree.item(i, "values")[0] for i in a.np_tree.get_children()]
    assert len(a.paid_tree.get_children()) == 1
    a.unmark_paid(a.paid_tree)
    assert a.cfg["paid_outside"] == []
    assert "Ben Bold" in [a.np_tree.item(i, "values")[0] for i in a.np_tree.get_children()]
