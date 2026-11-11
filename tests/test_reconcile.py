"""Matching, team membership, paying status and the not paying list."""
from conftest import THRIVE_HEADERS, row_for, rc, write_thrive


def test_results(result):
    assert row_for(result, "Amy Able").result == "Matched"
    assert row_for(result, "Ben Bold").result.startswith("Matched")
    assert row_for(result, "Sam Smith").result == "Check match"  # Sam / Samuel
    assert row_for(result, "Samuel Smith").thrive_name == "Samuel Smith"
    assert row_for(result, "Dan Dee").result == "FA only"
    assert row_for(result, "Eve East").result == "Thrive only"
    assert row_for(result, "Tia Tiny").result == "Thrive only (expected)"
    assert row_for(result, "Zed Zee").result == "FA only (not registered)"


def test_views_separate_no_fa_groups(result):
    views = dict(rc.RESULT_TABS)
    tia, eve = row_for(result, "Tia Tiny"), row_for(result, "Eve East")
    assert views["In Thrive, not in FA"](eve) and not views["In Thrive, not in FA"](tia)
    assert views["No FA team (U4-U6, training)"](tia)
    assert not views["Needs attention"](tia)


def test_team_membership_and_no_fa_source(result):
    labels = rc.team_labels(result)
    assert "U11 White" in labels and "U12 Black" in labels and "U05 (Thrive)" in labels
    assert [src for src, _r in result.teams["U05 (Thrive)"]] == [rc.NO_FA]


def test_paying_status(result):
    assert rc.paying_status(row_for(result, "Amy Able")) == "Yes"
    assert rc.paying_status(row_for(result, "Ben Bold")) == "No: no active mandate"
    assert rc.paying_status(row_for(result, "Dan Dee")) == "No: not in Thrive"
    assert rc.paying_label("No: no active mandate") == "✖ NOT PAYING (no active mandate)"
    assert rc.paying_label("Yes") == "✔ Yes"


def test_not_paying_list(result):
    headers, rows = rc.not_paying_report(result)
    names = {v[0] for v, _src in rows}
    assert names == {"Ben Bold", "Dan Dee", "Tia Tiny"}
    tia = next(v for v, _src in rows if v[0] == "Tia Tiny")
    assert tia[headers.index("In")] == rc.NO_FA


def test_unknown_mandates_flag_nobody(tmp_path, fa_path):
    headers = [h for h in THRIVE_HEADERS if h != "Active mandates"]
    res = rc.reconcile(rc.load_fa(fa_path), rc.load_thrive(write_thrive(tmp_path / "t.xlsx", headers)),
                       dict(rc.DEFAULT_TEAM_MAP))
    _h, rows = rc.not_paying_report(res)
    assert {v[0] for v, _s in rows} == {"Dan Dee"}  # only the player missing from Thrive
    assert rc.paying_status(row_for(res, "Ben Bold")).startswith("Unknown")


def test_team_sheet_compact_view(result):
    headers, rows = rc.team_report(result, "U11 White")
    view = rc.team_view_headers(True)
    assert view[:2] == ["Player", "Paying"] and "Consents" in view
    by_name = {v[0]: rc.team_overview(headers, v, True) for v, _s in rows}
    assert by_name["Ben Bold"][1].startswith("✖ NOT PAYING")
    assert by_name["Ben Bold"][view.index("Consents")] == "✖ Photography"
    assert by_name["Amy Able"][view.index("Consents")] == "✔"


def test_suggest_mapping():
    found = rc.suggest_mapping(["U07 Eagles", "U04", "U7-8 Training", "Mystery"], [rc._CLUB + "U7 Eagles"])
    assert found == {"U07 Eagles": rc._CLUB + "U7 Eagles", "U04": rc.IGNORE, "U7-8 Training": rc.IGNORE}
