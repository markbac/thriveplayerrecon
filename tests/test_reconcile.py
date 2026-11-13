"""Matching, team membership, paying status and the not paying list."""
import pytest

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


def test_team_choice_label_with_manager(result):
    staff = [
        rc.Staff("Alex Example", "Manager", ["U12 Black"]),
        rc.Staff("Pat Sample", "Assistant manager", ["U11 White"]),
    ]
    rc.attach_staff(result, staff, rc.DEFAULT_TEAM_MAP)
    assert rc.team_choice_label(result, "U12 Black") == "U12 Black (Alex Example)"
    assert rc.team_choice_label(result, "U11 White") == "U11 White"


def test_team_choice_label_with_unpaid(result):
    rc.attach_staff(result, [rc.Staff("Alex Example", "Manager", ["U12 Black"], "07700 900010")],
                    rc.DEFAULT_TEAM_MAP)
    for label in rc.team_labels(result):
        n = rc.unpaid_count(result, label)
        assert n == len(rc.not_paying_by_team(result).get(label, []))
        text = rc.team_choice_label_with_unpaid(result, label)
        assert text.endswith(f"— {n} not paying" if n else "— ✔ all paying")
    assert rc.team_choice_label_with_unpaid(result, "U12 Black").startswith("U12 Black (Alex Example) — ")
    assert rc.manager_contacts(result, "U12 Black") == [("Alex Example", "07700 900010")]


@pytest.mark.parametrize("phone,expected", [
    ("07700 900010", "447700900010"),
    ("+44 7700 900010", "447700900010"),
    ("0044 7700 900010", "447700900010"),
    ("7700900010", "447700900010"),
    ("07700 900010 / 07700 900011", "447700900010"),
    ("+353 87 123 4567", "353871234567"),
    ("ask Sam", None),
    ("01234", None),
    ("", None),
])
def test_whatsapp_number(phone, expected):
    assert rc.whatsapp_number(phone) == expected


def test_whatsapp_link_matches_web_encoding():
    # Same output as encodeURIComponent in the web app
    assert rc.whatsapp_link("07700 900010", " Hi *Alex* & team\n✔ ") == (
        "https://wa.me/447700900010?text=Hi%20*Alex*%20%26%20team%0A%E2%9C%94")
    assert rc.whatsapp_link("07700 900010", "") == "https://wa.me/447700900010"
    assert rc.whatsapp_link("nope", "hi") is None


def test_squad_list_shows_only_thrive_players_oldest_first(result):
    from datetime import date
    text = rc.whatsapp_squad_list(result, "U11 White", today=date(2026, 11, 13), time_text="09:30")
    lines = text.split("\n")
    assert lines[0].startswith("*U11 White* squad in Thrive (") and lines[1] == "Generated 13/11/2026 09:30"
    assert "Dan Dee" not in text  # FA only, so not reported
    assert "\U0001f44e Ben Bold, " in text and "\U0001f44d Amy Able, " in text
    players = [x for x in lines if x[:1] in ("\U0001f44d", "\U0001f44e") and "=" not in x]
    dobs = [tuple(reversed(x.split(", ")[1].split(" ")[0].split("/"))) for x in players]
    assert dobs == sorted(dobs)
    assert "Direct debit: " in text and " without" in text


def test_squad_list_age_in_years_and_months():
    from datetime import date
    assert rc._age_years_months(date(2021, 8, 20), date(2026, 11, 13)) == "5y 2m"
    assert rc._age_years_months(date(2020, 10, 2), date(2026, 11, 13)) == "6y 1m"
    assert rc._age_years_months(date(2020, 11, 13), date(2026, 11, 13)) == "6y 0m"


def test_squad_list_without_mandate_column_has_no_thumbs(tmp_path, fa_path):
    headers = [h for h in THRIVE_HEADERS if h != "Active mandates"]
    res = rc.reconcile(rc.load_fa(fa_path), rc.load_thrive(write_thrive(tmp_path / "t.xlsx", headers)),
                       dict(rc.DEFAULT_TEAM_MAP))
    text = rc.whatsapp_squad_list(res, "U11 White")
    assert "\U0001f44d" not in text and "\U0001f44e" not in text and "Direct debit" not in text
    assert "Amy Able, " in text
