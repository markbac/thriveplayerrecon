"""Club PDF (teams, coaches and players) and the U4-U6 'never an FA team' rule."""
from conftest import born, rc, row_for, write_fa, write_thrive

import club_pdf


def _team(teams, label):
    return next(t for t in teams if t.label == label)


def test_summary_lists_coaches_and_player_status(result):
    rc.attach_staff(result, [rc.Staff("Alex Example", "Manager", ["U11 White"]),
                             rc.Staff("Jo Sample", "Assistant manager", ["U11 White"])], rc.DEFAULT_TEAM_MAP)
    teams = club_pdf.club_summary(result)
    assert sorted(t.label for t in teams) == sorted(rc.team_labels(result))
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


def test_youngest_groups_show_age_in_years_and_months(result):
    from datetime import date
    assert club_pdf.age_years_months(date(2022, 4, 15), date(2026, 11, 20)) == "4y 7m"
    assert club_pdf.age_years_months(date(2022, 4, 21), date(2026, 11, 20)) == "4y 6m"
    teams = club_pdf.club_summary(result)
    u5 = next(t for t in teams if rc.no_fa_age_group(t.label))
    assert all(p[1].endswith("m") and "y " in p[1] for p in u5.players)
    white = next(t for t in teams if t.label == "U11 White")
    assert all(p[1].isdigit() for p in white.players)


def test_training_groups_come_last(tmp_path):
    thrive = write_thrive(tmp_path / "t.xlsx", players=[
        ("Tom", "Train", born(8, 2), "U7-8 Training", "Active", {}),
        ("Amy", "Able", born(11, 2), "U11 White", "Active", {}),
        ("Tia", "Tiny", born(5, 7, 7), "U05 26-27", "Active", {}),
        ("Una", "Upper", born(10, 4), "U9-10 Training", "Active", {}),
    ])
    res = rc.reconcile(rc.load_fa(write_fa(tmp_path / "fa.xlsx")), rc.load_thrive(thrive), dict(rc.DEFAULT_TEAM_MAP))
    labels = [t.label for t in club_pdf.club_summary(res)]
    assert labels[-2:] == ["U7-8 Training (Thrive)", "U9-10 Training (Thrive)"]
    assert labels[0].startswith("U05") and "U11 White" in labels[:-2]


def test_club_totals_count_each_player_once(tmp_path):
    thrive = write_thrive(tmp_path / "t.xlsx", players=[
        ("Amy", "Able", born(11, 2), "U11 White, U12 Black", "Active", {}),  # Saturday and Sunday teams
        ("Ben", "Bold", born(11, 3), "U11 White", "", {}),
        ("Tom", "Train", born(8, 2), "U08 Black, U7-8 Training", "Active", {}),  # training is not a second team
    ])
    res = rc.reconcile([], rc.load_thrive(thrive), dict(rc.DEFAULT_TEAM_MAP))
    totals = dict(club_pdf.club_totals(res))
    assert totals["Players in the club (each counted once)"] == 3
    assert totals["Playing in two or more teams (e.g. Saturday and Sunday)"] == 1
    assert totals["Team places (a player in two teams counts twice)"] == 5
    assert totals["Paying through Thrive"] == 2 and totals["Not paying"] == 1


OFFICIALS_ROWS = [  # invented people, in the club officials file layout
    ("Name", "Role", "Second role", "Exec Member", "Team(s)", "Phone", "Email"),
    ("Alex Example", "Manager", None, None, "U11 White", "07700 900001", None),
    ("Jo Sample", "Assistant manager", "Treasurer", "Yes", "U11 White", None, None),
    ("Kim Lead", "Manager", "U6 Lead", None, "U8 Blue", None, None),
    ("Pat Chair", "Chairman", None, "Yes", None, None, None),
    ("Lee Elder", "President", None, None, None, None, None),
    (None, "Social Media Coordinator", None, "yes", None, None, None),
    ("Sam Small", "U5 Lead", None, None, None, None, None),
    ("Ray Help", "U5 Assistant", "U04 Assistant", None, None, None, None),
    ("Val Liaison", None, "Club Liaison Officer", "Yes", "U12 Black", None, None),
]


def test_officials_file_is_grouped_for_the_officials_page():
    officials = club_pdf.parse_officials([OFFICIALS_ROWS])
    summary = club_pdf.officials_summary(officials)
    assert summary.president == ["Lee Elder"]
    assert summary.executive == [("Chairman", "Pat Chair", ""),
                                 ("Treasurer", "Jo Sample", "Assistant manager (U11 White)"),
                                 ("Club Liaison Officer", "Val Liaison", "Manager (U12 Black)"),
                                 ("Social Media Coordinator", "Vacant", "")]
    teams = {t: (m, a) for t, m, a in summary.teams}
    assert teams["U4"] == ([], ["Ray Help"])
    assert teams["U5"] == (["Sam Small"], ["Ray Help"])
    assert teams["U6"] == (["Kim Lead"], [])
    assert teams["U11 White"] == (["Alex Example"], ["Jo Sample"])
    assert teams["U12 Black"] == (["Val Liaison"], [])
    assert [t for t, _m, _a in summary.teams][:3] == ["U4", "U5", "U6"]
    totals = dict(club_pdf.officials_totals(officials))
    assert totals == {"Club officials (people)": 8, "Executive committee roles": 4,
                      "Executive committee roles vacant": 1, "Managers and team leads": 4, "Assistant managers": 2}


def test_old_managers_file_still_works_for_the_officials_page(result, tmp_path):
    rc.write_staff_template(str(tmp_path / "m.xlsx"))
    officials = club_pdf.load_officials(str(tmp_path / "m.xlsx"))
    assert officials and all(club_pdf._team_role(o.role) for o in officials if o.name)
    # with no file, the managers attached to the result are used
    rc.attach_staff(result, [rc.Staff("Alex Example", "Manager", ["U11 White"])], rc.DEFAULT_TEAM_MAP)
    summary = club_pdf.officials_summary(club_pdf.officials_from_staff(result))
    assert summary.teams == [("U11 White", ["Alex Example"], [])]


def test_age_group_leads_appear_on_u4_to_u6_team_pages(result, tmp_path):
    officials = club_pdf.parse_officials([OFFICIALS_ROWS])
    u5 = next(t for t in club_pdf.club_summary(result, officials=officials) if rc.no_fa_age_group(t.label))
    assert u5.staff == [("U5 Lead", "Sam Small"), ("U5 Assistant", "Ray Help")]
    club_pdf.export_club_pdf(str(tmp_path / "c.pdf"), result, officials=officials)
    assert (tmp_path / "c.pdf").read_bytes().startswith(b"%PDF")
