"""Thrive-only runs: no FA report, so teams come from Thrive and FA registration is not checked."""
from conftest import THRIVE_PLAYERS, born, rc, write_thrive


def _result(thrive_path):
    return rc.reconcile([], rc.load_thrive(thrive_path), dict(rc.DEFAULT_TEAM_MAP))


def test_teams_are_thrive_team_names(thrive_path):
    res = _result(thrive_path)
    assert res.fa_checked is False and res.club_prefix == ""
    assert set(res.teams) == {"U11 White", "U12 Black", "U05"}
    assert {src for src, _r in res.teams["U11 White"]} == {rc.FA_NOT_CHECKED}
    assert [src for src, _r in res.teams["U05"]] == [rc.NO_FA]
    assert len(res.rows) == len(THRIVE_PLAYERS)


def test_nobody_is_flagged_for_missing_fa_registration(thrive_path):
    res = _result(thrive_path)
    assert not any(r.result in ("Thrive only", "FA only", "Check match") for r in res.rows)
    assert {r.result for r in res.rows} <= {rc.FA_NOT_CHECKED, rc.FA_NOT_CHECKED + " (data quality)",
                                            "Thrive only (expected)"}
    assert rc.view_title("Check match", res) == "Check match (FA not checked)"
    assert rc.view_title("Data quality", res) == "Data quality"


def test_unmapped_thrive_teams_still_get_a_team(tmp_path):
    path = write_thrive(tmp_path / "t.xlsx", players=[("Una", "Unmapped", born(9, 1), "U09 Purple", "Active", {})])
    res = _result(path)
    assert list(res.teams) == ["U09 Purple"]
    assert res.rows[0].result == rc.FA_NOT_CHECKED and res.rows[0].issue == ""


def test_thrive_data_checks_still_run(tmp_path):
    players = [("Pat", "Parent", born(40, 1), "U11 White", "Active", {}),
               ("Tom", "Train", born(9, 1), "U9-10 Training", "Active", {})]
    res = _result(write_thrive(tmp_path / "t.xlsx", players=players))
    pat = next(r for r in res.rows if r.thrive_name == "Pat Parent")
    assert pat.result == rc.FA_NOT_CHECKED + " (data quality)" and "parent/carer" in pat.dq
    assert "too old for U11 White" in pat.dq
    tom = next(r for r in res.rows if r.thrive_name == "Tom Train")
    assert tom.dq == ""  # training groups have no age limit


def test_messages_and_lists_say_fa_not_checked(thrive_path):
    res = _result(thrive_path)
    squad = rc.whatsapp_squad(res, "U11 White")[0]
    assert "FA not checked" in squad and "FA ❌" not in squad
    assert "squad in Thrive" in rc.whatsapp_squad_list(res, "U11 White")
    _h, rows = rc.not_paying_report(res)
    assert {v[0] for v, _s in rows} == {"Ben Bold", "Tia Tiny"}


def test_full_workbook_exports(thrive_path, tmp_path):
    res = _result(thrive_path)
    out = tmp_path / "all.xlsx"
    rc.export_xlsx(str(out), res, dict(rc.DEFAULT_TEAM_MAP), "", "thrive.xlsx")
    assert out.exists()
    (tmp_path / "teams").mkdir()
    assert rc.export_each_team(str(tmp_path / "teams"), res)
