"""Generate shared JSON parity fixtures in tests/parity/expected_parity.json from the Python engine."""
import json
import os
import sys
import tempfile
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

import openpyxl  # noqa: E402
import reconcile_core as rc  # noqa: E402

REF_TODAY = date(2026, 11, 11)
SEASON_YEAR = rc._season_ref(REF_TODAY).year


def born(age_group: int, month: int, day: int = 1) -> date:
    return date(SEASON_YEAR - age_group + 1, month, day)


THRIVE_HEADERS = [
    "First name", "Last name", "Date of birth", "Teams", "Active mandates", "Account owner", "Owner phone",
    "Parents/guardian name, required for FA registration", "Parents/guardian email address for FA registration",
    "Parents/guardian date of birth required for FA registration", "Has medical conditions", "Medical conditions",
    "Allergies", "Medicines", "Medical notes", "WWFC photography policy", "WWFC code of conduct - youth players",
    "Club rules",
]
CONSENTED = {
    "WWFC photography policy": "Yes",
    "WWFC code of conduct - youth players": "I agree",
    "Club rules": "Yes",
}

# Comprehensive set of cases covering all matching, team differences, DQ flags, duplicates, nicknames, etc.
PARITY_THRIVE_PLAYERS = [
    # 1. Exact match, paying, all consents
    ("Amy", "Able", born(11, 2, 1), "U11 White", "Active", {}),
    # 2. Exact match, not paying, missing photography consent
    ("Ben", "Bold", born(11, 3, 1), "U11 White", "", {"WWFC photography policy": "No"}),
    # 3. Exact match, medical condition, blank conduct consent
    ("Cal", "Cole", born(12, 4, 1), "U12 Black", "Active",
     {"Has medical conditions": "True", "Medical conditions": "Asthma", "Medicines": "Inhaler",
      "WWFC code of conduct - youth players": ""}),
    # 4. Prefix name match (Samuel vs Sam) -> Check match
    ("Samuel", "Smith", born(11, 5, 5), "U11 White", "Active", {}),
    # 5. Nickname match (Teddy vs Edward) + 1-field DOB diff -> Check match
    ("Teddy", "Taylor", born(10, 4, 10), "U10 Blue", "Active", {}),
    # 6. Double-barrelled surname suffix match (Adamos Beswick vs Beswick) -> Check match
    ("Liam", "Adamos Beswick", born(10, 6, 15), "U10 Blue", "Active", {}),
    # 7. Swapped first/last names -> Check match
    ("Wilson", "Oliver", born(11, 1, 20), "U11 White", "Active", {}),
    # 8. Close typo match (Walked vs Walker) -> Check match
    ("Harry", "Walked", born(10, 2, 14), "U10 Blue", "Active", {}),
    # 9. Matched (team differs): U11 Black in Thrive vs U11 White in FA
    ("Jack", "Jones", born(11, 7, 12), "U11 Black", "Active", {}),
    # 10. Matched (data quality): lowercase capitalisation + adult DOB in Thrive
    ("noah", "brown", date(1985, 5, 10), "U12 Black", "Active", {}),
    # 11. Thrive only (in mapped team)
    ("Eve", "East", born(11, 6, 6), "U11 White", "Active", {}),
    # 12. Thrive only (expected) in U05 (ignore group), unpaid
    ("Tia", "Tiny", born(5, 7, 7), "U05", "", {}),
    # 13. Duplicate Thrive records
    ("Mia", "Moore", born(11, 4, 4), "U11 White", "Active", {}),
    ("Mia", "Moore", born(11, 4, 4), "U11 White", "Active", {}),
    # 14. Thrive name matches an FA parent/carer ("Pat Able")
    ("Pat", "Able", born(11, 8, 1), "U11 White", "Active", {}),
]

PARITY_FA_PLAYERS = [
    ("Amy", "Able", "1001", born(11, 2, 1), "U11 White", "Registered"),
    ("Ben", "Bold", "1002", born(11, 3, 1), "U11 White", "Registered"),
    ("Cal", "Cole", "1003", born(12, 4, 1), "U12 Black", "Registered"),
    ("Sam", "Smith", "1004", born(11, 5, 5), "U11 White", "Registered"),
    ("Edward", "Taylor", "1005", born(10, 4, 12), "U10 Blue", "Registered"),
    ("Liam", "Beswick", "1006", born(10, 6, 15), "U10 Blue", "Registered"),
    ("Oliver", "Wilson", "1007", born(11, 1, 20), "U11 White", "Registered"),
    ("Harry", "Walker", "1008", born(10, 2, 14), "U10 Blue", "Registered"),
    ("Jack", "Jones", "1009", born(11, 7, 12), "U11 White", "Registered"),
    ("Noah", "Brown", "1010", date(1985, 5, 10), "U12 Black", "Registered"),
    # FA only (registered)
    ("Dan", "Dee", "1011", born(12, 8, 8), "U12 Black", "Registered"),
    # FA only (not registered)
    ("Zed", "Zee", "1012", born(12, 6, 9), "U12 Black", "Cancelled"),
]


def fmt_val(v):
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    return v


def build_parity_data() -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        fa_file = os.path.join(tmp, "fa.xlsx")
        th_file = os.path.join(tmp, "thrive.xlsx")

        wb_fa = openpyxl.Workbook()
        ws_fa = wb_fa.active
        ws_fa.append([
            "First names", "Surname", "FAN ID", "Date of birth", "Team", "Registration status",
            "Parent/carer name", "Parent/carer email address", "Emergency contact", "Emergency contact phone"
        ])
        for first, last, fan, dob, team, status in PARITY_FA_PLAYERS:
            ws_fa.append([
                first, last, fan, dob, rc._CLUB + team, status,
                f"Pat {last}", f"pat.{last.lower()}@example.com", f"Lee {last}", "07700900456"
            ])
        wb_fa.save(fa_file)

        wb_th = openpyxl.Workbook()
        ws_th = wb_th.active
        ws_th.append(["Thrive data export"])
        ws_th.append(THRIVE_HEADERS)
        for first, last, dob, teams, mandate, extra in PARITY_THRIVE_PLAYERS:
            row = {
                "First name": first, "Last name": last, "Date of birth": dob, "Teams": teams,
                "Active mandates": mandate, "Account owner": f"Pat {last}", "Owner phone": "07700900123",
                "Has medical conditions": "False", **CONSENTED, **extra
            }
            ws_th.append([row.get(h, "") for h in THRIVE_HEADERS])
        wb_th.save(th_file)

        fa_loaded = rc.load_fa(fa_file)
        missing = []
        th_loaded = rc.load_thrive(th_file, missing)
        res = rc.reconcile(fa_loaded, th_loaded, dict(rc.DEFAULT_TEAM_MAP), today=REF_TODAY)

        staff = [
            rc.Staff("Alex Coach", "Manager", ["U11 White"], "07700 900010", "alex@example.com"),
            rc.Staff("Sam Helper", "Assistant manager", ["U11 White", "U12 Black"], "07700 900011", ""),
        ]
        rc.attach_staff(res, staff, dict(rc.DEFAULT_TEAM_MAP))

        np_headers, np_rows = rc.not_paying_report(res, today=REF_TODAY)
        cons_headers, cons_rows, cons_checked = rc.consents_report(res, today=REF_TODAY)
        team_u11_headers, team_u11_rows = rc.team_report(res, "U11 White", True, today=REF_TODAY)

        return {
            "ref_today": REF_TODAY.strftime("%Y-%m-%d"),
            "club_prefix": res.club_prefix,
            "counts": dict(res.counts()),
            "team_labels": rc.team_labels(res),
            "staff_issues": res.staff_issues,
            "rows": [
                {
                    "result": r.result,
                    "level": r.level,
                    "confidence": r.confidence,
                    "issue": r.issue,
                    "dq": r.dq,
                    "fan_id": r.fan_id,
                    "fa_name": r.fa_name,
                    "thrive_name": r.thrive_name,
                    "fa_dob": fmt_val(r.fa_dob),
                    "thrive_dob": fmt_val(r.thrive_dob),
                    "fa_teams": r.fa_teams,
                    "thrive_teams": r.thrive_teams,
                    "expected_fa_teams": r.expected_fa_teams,
                    "fa_status": r.fa_status,
                    "mandate": r.mandate,
                    "paying_status": rc.paying_status(r),
                }
                for r in res.rows
            ],
            "not_paying": {
                "headers": np_headers,
                "rows": [([fmt_val(x) for x in vals], src) for vals, src in np_rows],
            },
            "consents": {
                "headers": cons_headers,
                "checked": cons_checked,
                "rows": [([fmt_val(x) for x in vals], src) for vals, src in cons_rows],
            },
            "team_u11_white": {
                "headers": team_u11_headers,
                "rows": [([fmt_val(x) for x in vals], src) for vals, src in team_u11_rows],
                "whatsapp_squad": rc.whatsapp_squad(res, "U11 White", today=REF_TODAY),
                "whatsapp_medical": rc.whatsapp_medical(res, "U11 White", today=REF_TODAY),
            },
            "whatsapp_not_paying_all": rc.whatsapp_not_paying(res, None, today=REF_TODAY),
        }


if __name__ == "__main__":
    out_dir = os.path.join(ROOT, "tests", "parity")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "expected_parity.json")
    data = build_parity_data()
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    print(f"Wrote {out_path}")
