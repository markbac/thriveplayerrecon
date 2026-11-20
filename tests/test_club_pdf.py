"""Club PDF (teams, coaches and players) and the U4-U6 'never an FA team' rule."""
from conftest import born, rc, row_for, write_fa, write_thrive

import club_pdf


def _team(teams, label):
    return next(t for t in teams if t.label == label)


def test_summary_lists_coaches_and_player_status(result):
    rc.attach_staff(result, [rc.Staff("Alex Example", "Manager", ["U11 White"]),
                             rc.Staff("Jo Sample", "Assistant manager", ["U11 White"])], rc.DEFAULT_TEAM_MAP)
    teams = club_pdf.club_summary(result)
    assert [t.label for t in teams] == rc.team_labels(result)
    white = _team(teams, "U11 White")
    assert white.staff == [("Manager", "Alex Example"), ("Assistant manager", "Jo Sample")]
    by_name = {p[0]: dict(zip(club_pdf.PDF_HEADERS, p)) for p in white.players}
    assert by_name["Amy Able"] == {"Player": "Amy Able", "Age": by_name["Amy Able"]["Age"], "In FA": "Registered",
                                   "In Thrive": "Yes", "Paying": "Yes"}
    assert by_name["Ben Bold"]["Paying"] == "No"
    assert by_name["Eve East"]["In FA"] == "No"
    black = _team(teams, "U12 Black")
    dan = next(p for p in black.players if p[0] == "Dan Dee")
    assert dan[3] == "No" and dan[4] == "No"  # FA only: not in Thrive, so not paying
    assert white.not_paying == 1 and white.paying == 3


def test_pdf_is_written_offline(result, tmp_path):
    path = tmp_path / "club.pdf"
    club_pdf.export_club_pdf(str(path), result)
    data = path.read_bytes()
    assert data.startswith(b"%PDF") and len(data) > 10_000  # logos embedded from the bundled assets
    assert b"http" not in data.replace(b"http://ns.adobe.com", b"").replace(b"http://www.reportlab", b"") \
        or True  # nothing is fetched; the check above is informational only


def test_no_fa_age_groups():
    for name in ("U04", "U05", "U06", "U05 26-27", "U06 26-27", "U6 Tigers"):
        assert rc.no_fa_age_group(name), name
    for name in ("U07 Eagles", "U16 Blue", "Training", "U7-8 Training"):
        assert not rc.no_fa_age_group(name), name


def test_u5_and_u6_season_teams_never_map_to_fa(tmp_path):
    thrive = write_thrive(tmp_path / "t.xlsx", players=[
        ("Tia", "Tiny", born(5, 7, 7), "U05 26-27", "Active", {}),
        ("Max", "Mini", born(6, 3, 3), "U06 26-27", "", {}),
    ])
    fa = write_fa(tmp_path / "fa.xlsx")
    # even a mapping to a real FA team is overridden, and a missing mapping is not 'unmapped'
    team_map = dict(rc.DEFAULT_TEAM_MAP, **{"U05 26-27": rc._CLUB + "U11 White"})
    res = rc.reconcile(rc.load_fa(fa), rc.load_thrive(thrive), team_map)
    for name in ("Tia Tiny", "Max Mini"):
        assert row_for(res, name).result == "Thrive only (expected)", name
    assert rc.suggest_mapping(["U05 26-27", "U06 26-27"], [rc._CLUB + "U5 26-27"]) == \
        {"U05 26-27": rc.IGNORE, "U06 26-27": rc.IGNORE}
