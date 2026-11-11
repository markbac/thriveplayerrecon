"""Reading the FA report and the Thrive export, including exports with missing columns."""
import pytest
from conftest import THRIVE_HEADERS, rc, write_thrive


def test_full_export_has_nothing_missing(thrive_path):
    missing = []
    players = rc.load_thrive(thrive_path, missing)
    assert missing == []
    assert len(players) == 6
    amy = players[0]
    assert (amy.first, amy.last, amy.mandate, amy.teams) == ("Amy", "Able", "Active", ["U11 White"])
    assert amy.fields["photo"] == "Yes"


def test_fa_rows_grouped_and_fields_read(fa_path):
    players = rc.load_fa(fa_path)
    assert len(players) == 6
    zed = next(p for p in players if p.last == "Zee")
    assert zed.registered_teams() == []
    assert players[0].fields["emergency"] == "Lee Able"


def test_optional_items_missing_are_reported(tmp_path):
    headers = [h for h in THRIVE_HEADERS if h not in (
        "Active mandates", "Has medical conditions", "Medical conditions", "Allergies", "Medicines")]
    missing = []
    players = rc.load_thrive(write_thrive(tmp_path / "t.xlsx", headers), missing)
    assert [item for item, _use in missing] == ["Active pre-authorisation", "Medical"]
    assert all(use for _item, use in missing)
    assert all(p.mandate == rc.MANDATE_UNKNOWN for p in players)


def test_missing_essential_columns_named_in_thrive_words(tmp_path):
    headers = [h for h in THRIVE_HEADERS if h not in ("Teams", "Date of birth")]
    with pytest.raises(rc.ReportError) as err:
        rc.load_thrive(write_thrive(tmp_path / "t.xlsx", headers))
    assert "missing: Date of birth, Teams." in str(err.value)
    assert "Manage table columns" in str(err.value)


def test_missing_first_and_last_name_reported_once_as_name(tmp_path):
    headers = [h for h in THRIVE_HEADERS if h not in ("First name", "Last name")]
    with pytest.raises(rc.ReportError, match=r"missing: Name\."):
        rc.load_thrive(write_thrive(tmp_path / "t.xlsx", headers))


def test_unrelated_file_rejected(tmp_path):
    with pytest.raises(rc.ReportError, match="does not look like"):
        rc.load_thrive(write_thrive(tmp_path / "t.xlsx", ["Foo", "Bar", "Teams"]))


def test_fa_report_passed_as_thrive_is_rejected(fa_path):
    with pytest.raises(rc.ReportError):
        rc.load_thrive(fa_path)


def test_detect_kind(fa_path, thrive_path, tmp_path):
    assert rc.detect_kind(fa_path) == "fa"
    assert rc.detect_kind(thrive_path) == "thrive"
    assert rc.detect_kind(str(tmp_path / "missing.xlsx")) is None


def test_every_thrive_item_is_listed_for_the_help():
    assert rc.THRIVE_ALL_ITEMS[:3] == ["Name", "Date of birth", "Teams"]
    assert "Active pre-authorisation" in rc.THRIVE_ALL_ITEMS and "Medical" in rc.THRIVE_ALL_ITEMS
    assert len(rc.THRIVE_ALL_ITEMS) == 14
