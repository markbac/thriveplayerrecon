"""Missing consents: what counts as given, which items are checked, and the report."""
import pytest
from conftest import THRIVE_HEADERS, rc, row_for, write_thrive


@pytest.mark.parametrize("answer,given", [
    ("Yes", True), ("I agree", True), ("Accepted", True), ("True", True),
    ("", False), ("No", False), ("false", False), ("Declined", False), ("I do not consent", False),
    ("Don't photograph", False), ("n/a", False), ("Withdrawn", False),
])
def test_consent_given(answer, given):
    assert rc.consent_given(answer) is given


def test_report_lists_missing_with_photography_first(result):
    headers, rows, checked = rc.consents_report(result)
    assert checked == ["Photography", "Code of conduct", "Club rules"]
    names = [v[0] for v, _s in rows]
    assert names == ["Ben Bold", "Cal Cole"]  # Ben has no photo consent, so first
    ben = rows[0][0]
    assert ben[headers.index("Missing")] == "Photography"
    assert ben[headers.index("Photography")] == "No"
    cal = rows[1][0]
    assert cal[headers.index("Code of conduct")] == "(blank)"


def test_players_not_in_thrive_are_not_checked(result):
    checked = rc.consents_checked(result)
    assert rc.missing_consents(row_for(result, "Dan Dee"), checked) == []


def test_item_not_in_export_is_not_checked(tmp_path, fa_path):
    headers = [h for h in THRIVE_HEADERS if h != "Club rules"]
    res = rc.reconcile(rc.load_fa(fa_path), rc.load_thrive(write_thrive(tmp_path / "t.xlsx", headers)),
                       dict(rc.DEFAULT_TEAM_MAP))
    _h, rows, checked = rc.consents_report(res)
    assert checked == ["Photography", "Code of conduct"]
    assert {v[0] for v, _s in rows} == {"Ben Bold", "Cal Cole"}


def test_squad_message_warns_about_photos(result):
    text = "\n".join(rc.whatsapp_squad(result, "U11 White"))
    ben = text.split("*Ben Bold*")[1].split("\n\n")[0]
    assert "No photography consent" in ben
    amy = text.split("*Amy Able*")[1].split("\n\n")[0]
    assert "consent" not in amy.lower()
