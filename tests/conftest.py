"""Shared fixtures: invented sample exports written as real .xlsx files, and a GUI app that never touches the
user's real settings. All names, dates and phone numbers are made up. Never put real player data in tests."""
import os
import sys
import time
from datetime import date

import openpyxl
import pytest

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
sys.path.insert(0, SRC)

import reconcile_core as rc  # noqa: E402

CLUB = "Wilpshire Wanderers "
_SEASON = rc._season_ref(date.today()).year  # dates are relative to the season so the data never ages out


def born(age_group: int, month: int, day: int = 1) -> date:
    """A birthday that fits age group U<age_group> this season (one year under the limit)."""
    return date(_SEASON - age_group + 1, month, day)

THRIVE_HEADERS = [
    "First name", "Last name", "Date of birth", "Teams", "Active mandates", "Account owner", "Owner phone",
    "Parents/guardian name, required for FA registration", "Parents/guardian email address for FA registration",
    "Parents/guardian date of birth required for FA registration", "Has medical conditions", "Medical conditions",
    "Allergies", "Medicines", "Medical notes", "WWFC photography policy", "WWFC code of conduct - youth players",
    "Club rules",
]

# Thrive players: first, last, dob, teams, mandate, extra fields
THRIVE_PLAYERS = [
    ("Amy", "Able", born(11, 2), "U11 White", "Active", {}),
    ("Ben", "Bold", born(11, 3), "U11 White", "", {"WWFC photography policy": "No"}),
    ("Cal", "Cole", born(12, 4), "U12 Black", "Active",
     {"Has medical conditions": "True", "Medical conditions": "Asthma", "Medicines": "Inhaler",
      "WWFC code of conduct - youth players": ""}),
    ("Samuel", "Smith", born(11, 5, 5), "U11 White", "Active", {}),
    ("Eve", "East", born(11, 6, 6), "U11 White", "Active", {}),
    ("Tia", "Tiny", born(5, 7, 7), "U05", "", {}),
]
CONSENTED = {"WWFC photography policy": "Yes", "WWFC code of conduct - youth players": "I agree",
             "Club rules": "Yes"}

# FA rows: first, last, fan id, dob, team, status
FA_PLAYERS = [
    ("Amy", "Able", "1001", born(11, 2), "U11 White", "Registered"),
    ("Ben", "Bold", "1002", born(11, 3), "U11 White", "Registered"),
    ("Cal", "Cole", "1003", born(12, 4), "U12 Black", "Registered"),
    ("Sam", "Smith", "1004", born(11, 5, 5), "U11 White", "Registered"),
    ("Dan", "Dee", "1005", born(12, 8, 8), "U12 Black", "Registered"),
    ("Zed", "Zee", "1006", born(12, 6, 9), "U12 Black", "Cancelled"),
]
FA_HEADERS = ["First names", "Surname", "FAN ID", "Date of birth", "Team", "Registration status",
              "Parent/carer name", "Parent/carer email address", "Emergency contact", "Emergency contact phone"]


def write_thrive(path, headers=None, players=None):
    headers = headers or THRIVE_HEADERS
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Thrive data export"])  # a title row above the headers, as real exports can have
    ws.append(headers)
    for first, last, dob, teams, mandate, extra in players or THRIVE_PLAYERS:
        row = {"First name": first, "Last name": last, "Date of birth": dob, "Teams": teams,
               "Active mandates": mandate, "Account owner": f"Pat {last}", "Owner phone": "07700900123",
               "Has medical conditions": "False", **CONSENTED, **extra}
        ws.append([row.get(h, "") for h in headers])
    wb.save(path)
    return str(path)


def write_fa(path, players=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(FA_HEADERS)
    for first, last, fan, dob, team, status in players or FA_PLAYERS:
        ws.append([first, last, fan, dob, CLUB + team, status, f"Pat {last}", f"pat.{last.lower()}@example.com",
                   f"Lee {last}", "07700900456"])
    wb.save(path)
    return str(path)


@pytest.fixture
def fa_path(tmp_path):
    return write_fa(tmp_path / "fa.xlsx")


@pytest.fixture
def thrive_path(tmp_path):
    return write_thrive(tmp_path / "thrive.xlsx")


@pytest.fixture
def result(fa_path, thrive_path):
    res = rc.reconcile(rc.load_fa(fa_path), rc.load_thrive(thrive_path), dict(rc.DEFAULT_TEAM_MAP))
    rc.attach_staff(res, [], rc.DEFAULT_TEAM_MAP)
    return res


def row_for(result, name):
    for r in result.rows:
        if name in (r.fa_name, r.thrive_name):
            return r
    raise KeyError(name)


# ----------------------------------------------------------------------------------------------- GUI

@pytest.fixture
def app_factory(tmp_path, monkeypatch):
    """Make App instances with settings in tmp_path and dialogs answered automatically."""
    tk = pytest.importorskip("tkinter")
    for attempt in range(3):
        try:
            tk.Tk().destroy()
            break
        except tk.TclError as exc:
            if "display" in str(exc).lower():
                pytest.skip("no display available for Tk")
            if attempt == 2:
                raise
            time.sleep(0.5)  # Tk on Windows can fail to read init.tcl transiently
    import app as appmod

    cfg = tmp_path / "config.json"
    monkeypatch.setattr(appmod, "config_path", lambda: str(cfg))
    dialogs = []
    for name in ("showinfo", "showwarning", "showerror"):
        monkeypatch.setattr(appmod.messagebox, name, lambda *a, _n=name, **k: dialogs.append((_n, a)))
    monkeypatch.setattr(appmod.messagebox, "askokcancel", lambda *a, **k: True)
    monkeypatch.setattr(appmod.messagebox, "askyesno", lambda *a, **k: False)
    made = []

    def make():
        # Tk on Windows occasionally fails to read init.tcl when windows are created back to back; retry
        for attempt in range(3):
            try:
                a = appmod.App()
                break
            except tk.TclError:
                if attempt == 2:
                    raise
                time.sleep(0.5)
        a.dialogs = dialogs
        made.append(a)
        return a
    make.appmod = appmod
    yield make
    for a in made:
        try:
            a.destroy()
        except Exception:
            pass


def reconcile_in_app(a, fa, thrive, timeout=30):
    """Run Reconcile through the GUI (background thread and all) and wait for it to finish."""
    a.staff_var.set("")
    a.fa_var.set(fa)
    a.thrive_var.set(thrive)
    a.run()
    end = time.time() + timeout
    while a.busy or a.result is None:
        if time.time() > end:
            raise TimeoutError("reconcile did not finish")
        a.update()
        time.sleep(0.02)
    a.update()
