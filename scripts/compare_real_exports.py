"""Compare the Python desktop engine and TypeScript web engine on real club exports locally (#17, #26).

Usage:
    py scripts/compare_real_exports.py <path/to/fa.xlsx> <path/to/thrive.xlsx> [path/to/managers.xlsx]

Neither the input files nor any player data are written to disk or committed.
"""
import json
import os
import subprocess
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

import reconcile_core as rc  # noqa: E402


def fmt_val(v):
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    return v


def run_python_engine(fa_path: str, thrive_path: str, staff_path: str = "") -> dict:
    fa_players = rc.load_fa(fa_path)
    missing = []
    th_players = rc.load_thrive(thrive_path, missing)
    team_map = dict(rc.DEFAULT_TEAM_MAP)
    team_map.update(rc.suggest_mapping(
        [t for p in th_players for t in p.teams],
        [t for p in fa_players for t in p.teams],
    ))
    res = rc.reconcile(fa_players, th_players, team_map, rc.DEFAULT_FUZZY)
    if staff_path and os.path.isfile(staff_path):
        staff = rc.load_staff(staff_path)
        rc.attach_staff(res, staff, team_map)
    np_headers, np_rows = rc.not_paying_report(res)
    cons_headers, cons_rows, cons_checked = rc.consents_report(res)
    return json.loads(json.dumps({
        "club_prefix": res.club_prefix,
        "counts": dict(res.counts()),
        "team_labels": rc.team_labels(res),
        "missing_items": [list(x) for x in missing],
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
    }))


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__.strip())
        return 2
    fa_path = os.path.abspath(sys.argv[1])
    thrive_path = os.path.abspath(sys.argv[2])
    staff_path = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else ""

    py_out = run_python_engine(fa_path, thrive_path, staff_path)
    cmd = ["npx", "vitest", "run"]  # or node via vite-node
    web_dir = os.path.join(ROOT, "web")
    args = ["npx", "--yes", "tsx", "scripts/dump_real_parity.ts", fa_path, thrive_path]
    if staff_path:
        args.append(staff_path)
    proc = subprocess.run(args, cwd=web_dir, capture_output=True, text=True, shell=(os.name == "nt"))
    if proc.returncode != 0:
        print("Web engine failed:\n", proc.stderr, file=sys.stderr)
        return 1
    web_out = json.loads(proc.stdout)

    if py_out == web_out:
        print(f"PASS: Python and Web engines produced 100% identical results ({len(py_out['rows'])} rows, "
              f"{len(py_out['team_labels'])} teams, {len(py_out['not_paying']['rows'])} not paying).")
        return 0

    print("MISMATCH between Python and Web engines:")
    for key in py_out:
        if py_out[key] != web_out.get(key):
            print(f"  - Difference in '{key}'")
    return 1


if __name__ == "__main__":
    sys.exit(main())
