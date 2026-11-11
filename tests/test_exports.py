"""Excel exports: team files with the matchday sheet, the full workbook and the lists."""
import os

import openpyxl
from conftest import rc


def _sheet_rows(ws, header_row):
    headers = [c.value for c in ws[header_row]]
    rows = [[c.value for c in r] for r in ws.iter_rows(min_row=header_row + 1)]
    return headers, [r for r in rows if r[1]]


def test_each_team_file_opens_on_a_matchday_sheet(result, tmp_path):
    paths = rc.export_each_team(str(tmp_path), result)
    assert len(paths) == len(rc.team_labels(result))
    wb = openpyxl.load_workbook(os.path.join(tmp_path, "Team_U11_White.xlsx"))
    assert wb.sheetnames[0] == "Matchday sheet" and wb.sheetnames[1].startswith("Team ")
    ws = wb["Matchday sheet"]
    assert ws["A1"].value == "Matchday sheet: U11 White"
    headers, rows = _sheet_rows(ws, 5)
    assert headers[:2] == ["Here", "Player"] and "Medical alert" in headers and "Photos OK" in headers
    by_name = {r[1]: dict(zip(headers, r)) for r in rows}
    assert by_name["Ben Bold"]["Photos OK"] == "NO"
    assert by_name["Amy Able"]["Photos OK"] == "Yes"
    assert by_name["Amy Able"]["Emergency contact"] == "Lee Able"
    assert by_name["Amy Able"]["Contact phone"] == "07700 900123"


def test_matchday_sheet_is_set_up_for_printing(result, tmp_path):
    rc.export_team_xlsx(str(tmp_path / "t.xlsx"), result, "U12 Black")
    ws = openpyxl.load_workbook(tmp_path / "t.xlsx")["Matchday sheet"]
    assert ws.page_setup.orientation == "landscape"
    assert ws.sheet_properties.pageSetUpPr.fitToPage
    assert ws.page_setup.fitToWidth == 1
    assert ws.print_title_rows == "$5:$5"
    headers, rows = _sheet_rows(ws, 5)
    cal = dict(zip(headers, next(r for r in rows if r[1] == "Cal Cole")))
    assert "Asthma" in cal["Medical alert"] and "Inhaler" in cal["Medical alert"]


def test_matchday_sheet_respects_medical_setting(result, tmp_path):
    rc.export_team_xlsx(str(tmp_path / "t.xlsx"), result, "U12 Black", include_medical=False)
    wb = openpyxl.load_workbook(tmp_path / "t.xlsx")
    headers, _rows = _sheet_rows(wb["Matchday sheet"], 5)
    assert "Medical alert" not in headers
    team_headers = [c.value for c in wb.worksheets[1][list(wb.worksheets[1].values).index(
        next(r for r in wb.worksheets[1].values if r and r[0] == "Player")) + 1]]
    assert "Medical conditions" not in team_headers


def test_full_workbook_has_lists(result, tmp_path):
    rc.export_xlsx(str(tmp_path / "all.xlsx"), result, dict(rc.DEFAULT_TEAM_MAP))
    names = openpyxl.load_workbook(tmp_path / "all.xlsx").sheetnames
    for sheet in ("Summary", "Not paying", "Missing consents", "Team mapping", "Team U11 White"):
        assert sheet in names


def test_consents_and_not_paying_exports(result, tmp_path):
    rc.export_consents_xlsx(str(tmp_path / "c.xlsx"), result)
    ws = openpyxl.load_workbook(tmp_path / "c.xlsx").active
    values = [c.value for row in ws.iter_rows() for c in row]
    assert "Ben Bold" in values and "Amy Able" not in values
    rc.export_not_paying_xlsx(str(tmp_path / "n.xlsx"), result)
    values = [c.value for row in openpyxl.load_workbook(tmp_path / "n.xlsx").active.iter_rows() for c in row]
    assert "Dan Dee" in values and "Amy Able" not in values


def test_whatsapp_not_paying_text(result):
    text = "\n".join(rc.whatsapp_not_paying(result))
    assert "Tia Tiny (U05 (Thrive))" in text
    tia = text.split("Tia Tiny")[1].split("\n")[1]
    assert "FA not needed" in tia and "Active mandate ❌" in tia
    one = rc.whatsapp_not_paying(result, "U11 White")[0]
    assert "Ben Bold" in one and "Dan Dee" not in one


def test_long_messages_are_split(result, monkeypatch):
    monkeypatch.setattr(rc, "WHATSAPP_LIMIT", 300)
    parts = rc.whatsapp_squad(result, "U11 White")
    assert len(parts) > 1 and all("part" in p.split("\n")[0] for p in parts)
