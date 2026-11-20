"""Coaches reconciliation from the FA Team Qualifications Report (invented people and dates only)."""
from datetime import date

import openpyxl
from conftest import rc

import club_pdf
import coaches as co

TODAY = date(2026, 11, 20)

# Laid out like the FA export: title block, headers on row 10, team columns only on each team's first row
QUAL_ROWS = [
    ("REPORT TYPE:", "Team Qualifications Report", None, "Warning", "All copies of this extract must be destroyed"),
    ("EXPORTED BY:", "Test User"),
    ("DATE & TIME:", "13/11/2026 09:58 PM"),
    (), (), ("Information",), ("Qualifications highlighted in red require action",), (), (),
    ("Team Age", "Team Name", "Youth team with qualified coach/manager", "Adult team with first aid in football "
     "education", "Team Roles", "FAN", "Name", "Highest Coaching Qualification", "First Aid Expiry",
     "Safeguarding Children Expiry", "DBS Expiry"),
    ("U8", "Wilpshire Wanderers U8 Blue", "Complete", "N/A", "Team Coach", "100", "Christopher Example",
     "Introduction to Coaching Football", "Expired", "16/04/2028", "14/03/2028"),
    (None, None, None, None, "Assistant Team Coach", "101", "Jo Sample", None, "Not Held", "10/12/2026",
     "31/01/2027"),
    (None, "Wilpshire Wanderers U8 Red", "Incomplete", "N/A", "Team Coach", "102", "Richard Tester",
     "Level 1 in Coaching Football", "03/03/2029", "Expiring (01/02/2027)", "15/05/2027"),
    ("U9", "Wilpshire Wanderers U9 Black", "Complete", "N/A", "Team Coach", "102", "Richard Tester",
     "Level 1 in Coaching Football", "03/03/2029", "Expiring (01/02/2027)", "15/05/2027"),
    (None, None, None, None, "Team Manager", "103", "Pat Unlisted", "UEFA B Licence", "18/06/2028", "02/02/2028",
     "20/06/2028"),
    (), (),
    ("England Football Accreditation Definitions",),
    ("Youth Team with qualified coach/manager:", None, "Youth teams must have at least one qualified coach"),
]

OFFICIALS = [  # as in the club officials file
    ("Name", "Role", "Second role", "Exec Member", "Team(s)", "Phone"),
    ("Chris Example", "Manager", None, None, "U8 Blue", "07700 900111"),
    ("Jo Sample", "Assistant manager", "Treasurer", "Yes", "U8 Blue", None),
    ("Rick Tester", "Manager", None, None, "U8 Red", "07700 900222"),
    ("Sam Missing", "Assistant manager", None, None, "U9 Black", None),
    ("Lee Chair", "Chairman", None, "Yes", None, None),
]


def _report(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Team Qualifications Report"
    for r in QUAL_ROWS:
        ws.append(list(r))
    path = tmp_path / "Club_TeamQualificationReport_13112026.xlsx"
    wb.save(path)
    return str(path)


def test_report_is_read_with_merged_team_cells_carried_down(tmp_path):
    res = co.load_qualifications(_report(tmp_path))
    assert res.report_date == "13/11/2026 09:58 PM"
    by_name = {c.name: c for c in res.coaches}
    assert set(by_name) == {"Christopher Example", "Jo Sample", "Richard Tester", "Pat Unlisted"}
    assert by_name["Jo Sample"].teams == ["U8 Blue"]
    assert by_name["Richard Tester"].teams == ["U8 Red", "U9 Black"]  # one person, two teams
    assert by_name["Pat Unlisted"].teams == ["U9 Black"] and by_name["Pat Unlisted"].roles == ["Team Manager"]
    assert [(t.team, t.complete) for t in res.teams] == [("U8 Blue", "Complete"), ("U8 Red", "Incomplete"),
                                                         ("U9 Black", "Complete")]
    sg = by_name["Richard Tester"].certs["safeguarding"]
    assert sg.status == "expiring" and sg.expiry == date(2027, 2, 1)
    assert by_name["Christopher Example"].certs["first_aid"].status == "expired"
    assert by_name["Jo Sample"].certs["first_aid"].status == "not held"


def test_expiry_windows():
    def window(expiry):
        return co.Cert("valid", expiry).window(TODAY)
    assert window(date(2026, 11, 19)) == co.EXPIRED
    assert window(date(2026, 12, 20)) == co.M1
    assert window(date(2026, 12, 21)) == co.M3
    assert window(date(2027, 2, 20)) == co.M3
    assert window(date(2027, 5, 20)) == co.M6
    assert window(date(2027, 5, 21)) == co.OK == "6 months or more"
    assert co.add_months(date(2026, 8, 31), 6) == date(2027, 2, 28)


def test_filters_and_totals(tmp_path):
    res = co.load_qualifications(_report(tmp_path))
    names = lambda f: [v[0] for v, _l in co.coach_rows(res, f, TODAY)[1]]  # noqa: E731
    assert names("Expired or not held") == ["Christopher Example", "Jo Sample"]
    assert names("Expires within 1 month") == ["Jo Sample"]                 # safeguarding 10/12/2026
    assert names("Expires in 1 to 3 months") == ["Jo Sample", "Richard Tester"]  # DBS 31/01, safeguarding 01/02
    assert names("Expires in 3 to 6 months") == ["Richard Tester"]          # DBS 15/05/2027
    assert names("Expires in 6 months or more") == ["Pat Unlisted"]
    totals = dict(co.coaches_totals(res, TODAY))
    assert totals["Coaches and team officials in the FA report"] == 4
    assert totals["Teams without a qualified coach/manager (FA: Incomplete)"] == 1
    assert (totals["Expired"], totals["Not held"], totals["Expires within 1 month"], totals["Expires in 1 to 3 months"],
            totals["Expires in 3 to 6 months"], totals["All three in date for 6 months or more"]) == (1, 1, 1, 2, 1, 1)
    bands = {v[0]: band for v, band in co.coach_rows(res, "All coaches", TODAY)[1]}
    assert bands == {"Christopher Example": co.EXPIRED, "Jo Sample": co.NOT_HELD, "Richard Tester": co.M3,
                     "Pat Unlisted": co.OK}
    assert set(co.WINDOW_COLOURS) >= {co.EXPIRED, co.M1, co.M3, co.M6, co.OK, co.NOT_HELD}
    action, window = co.next_action(res.coaches[0], TODAY)  # Christopher Example
    assert action == "First Aid expired" and window == co.EXPIRED


def test_compared_with_the_officials_file(tmp_path):
    res = co.reconcile_coaches(co.load_qualifications(_report(tmp_path)), club_pdf.parse_officials([OFFICIALS]))
    by_name = {c.name: c for c in res.coaches}
    assert by_name["Christopher Example"].official == "Chris Example" and by_name["Christopher Example"].note == ""
    assert by_name["Richard Tester"].official == "Rick Tester"
    assert by_name["Richard Tester"].note == "Not listed for U9 Black in the officials file"
    assert by_name["Pat Unlisted"].note == "Not in the officials file"
    assert res.not_in_fa == [("Sam Missing", "Assistant manager", "U9 Black")]
    assert "Not in the officials file" in [f for f in co.FILTERS]
    assert [v[0] for v, _l in co.coach_rows(res, "Not in the officials file", TODAY)[1]] == ["Pat Unlisted"]


def test_same_person_and_team():
    assert co.same_person("Christopher Nestor", "Chris Nestor")
    assert co.same_person("Richard Worden", "Rick Worden")
    assert co.same_person("David Rawlings", "Dave Rawlings")
    assert co.same_person("Emily sewell", "Emily Sewell")
    assert not co.same_person("Chris Holt", "Chris Nestor")
    assert co.same_team("U8 White Sunday", "U8 White") and co.same_team("U08 Blue", "U8 Blue")
    assert not co.same_team("U8 White", "U8 Blue")


def test_not_a_qualifications_report(fa_path):
    try:
        co.load_qualifications(fa_path)
    except rc.ReportError as exc:
        assert "Team Qualifications Report" in str(exc)
    else:
        raise AssertionError("expected a ReportError")


def test_coaches_pdf_with_and_without_players(result, tmp_path):
    res = co.reconcile_coaches(co.load_qualifications(_report(tmp_path)), club_pdf.parse_officials([OFFICIALS]))
    club_pdf.export_club_pdf(str(tmp_path / "coaches_only.pdf"), None,
                             officials=club_pdf.parse_officials([OFFICIALS]), coaches=res)
    club_pdf.export_club_pdf(str(tmp_path / "both.pdf"), result, coaches=res)
    for name in ("coaches_only.pdf", "both.pdf"):
        assert (tmp_path / name).read_bytes().startswith(b"%PDF")


def test_latest_report_is_found(tmp_path):
    path = _report(tmp_path)
    assert co.find_latest_qualifications(str(tmp_path)) == path


def test_whatsapp_reminder(tmp_path):
    res = co.reconcile_coaches(co.load_qualifications(_report(tmp_path)), club_pdf.parse_officials([OFFICIALS]))
    by_name = {c.name: c for c in res.coaches}
    rick = by_name["Richard Tester"]
    assert rick.phone == "07700 900222" and co.needs_reminder(rick, TODAY)
    assert not co.needs_reminder(by_name["Pat Unlisted"], TODAY)
    text = co.reminder_message(rick, TODAY)
    assert text.startswith("Hi Richard, this is a reminder from Wilpshire Wanderers FC")
    assert "(U8 Red, U9 Black)" in text
    assert "- Safeguarding: expires 01/02/2027 (1 to 3 months)" in text
    assert "- DBS: expires 15/05/2027 (3 to 6 months)" in text
    assert "First Aid" not in text  # 03/03/2029: nothing to do
    assert text.index("Safeguarding: expires") < text.index("DBS: expires")  # most urgent first
    assert "What you need to do:" in text and co.TO_DO["safeguarding"] in text and co.TO_DO["dbs"] in text
    chris = co.reminder_message(by_name["Christopher Example"], TODAY)
    assert "- First Aid: expired" in chris
    jo = co.reminder_message(by_name["Jo Sample"], TODAY)
    assert "- First Aid: not on your FA record" in jo and "within 1 month" in jo
    assert rc.whatsapp_link(rick.phone, text).startswith("https://wa.me/447700900222?text=Hi%20Richard")
