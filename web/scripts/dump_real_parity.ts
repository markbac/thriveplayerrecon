/**
 * CLI helper used by scripts/compare_real_exports.py to run the TypeScript web engine
 * on local FA and Thrive files and print the JSON reconciliation result to stdout.
 */
import * as fs from 'node:fs';
import * as rc from '../src/reconcile_core';
import * as excelIo from '../src/excel_io';

async function main() {
  const [faPath, thrivePath, staffPath] = process.argv.slice(2);
  if (!faPath || !thrivePath) {
    console.error('Usage: npx vite-node scripts/dump_real_parity.ts <fa.xlsx> <thrive.xlsx> [managers.xlsx]');
    process.exit(2);
  }
  const faBuf = new Uint8Array(fs.readFileSync(faPath));
  const thBuf = new Uint8Array(fs.readFileSync(thrivePath));
  const faPlayers = await excelIo.load_fa(faBuf, faPath);
  const missing: Array<[string, string]> = [];
  const thPlayers = await excelIo.load_thrive(thBuf, thrivePath, missing);

  const teamMap = {
    ...rc.DEFAULT_TEAM_MAP,
    ...rc.suggest_mapping(
      thPlayers.flatMap((p) => p.teams),
      faPlayers.flatMap((p) => Object.keys(p.teams))
    ),
  };

  const res = rc.reconcile(faPlayers, thPlayers, teamMap, rc.DEFAULT_FUZZY);
  if (staffPath && fs.existsSync(staffPath)) {
    const staffBuf = new Uint8Array(fs.readFileSync(staffPath));
    const staff = await excelIo.load_staff(staffBuf, staffPath);
    rc.attach_staff(res, staff, teamMap);
  }

  const [npHeaders, npRows] = rc.not_paying_report(res);
  const [consHeaders, consRows, consChecked] = rc.consents_report(res);
  const fmtVal = (v: unknown) => (rc.isLocalDate(v) ? rc.formatDate(v) : v);

  const out = {
    club_prefix: res.club_prefix,
    counts: res.counts(),
    team_labels: rc.team_labels(res),
    missing_items: missing,
    staff_issues: res.staff_issues,
    rows: res.rows.map((r) => ({
      result: r.result,
      level: r.level,
      confidence: r.confidence,
      issue: r.issue,
      dq: r.dq,
      fan_id: r.fan_id,
      fa_name: r.fa_name,
      thrive_name: r.thrive_name,
      fa_dob: fmtVal(r.fa_dob),
      thrive_dob: fmtVal(r.thrive_dob),
      fa_teams: r.fa_teams,
      thrive_teams: r.thrive_teams,
      expected_fa_teams: r.expected_fa_teams,
      fa_status: r.fa_status,
      mandate: r.mandate,
      paying_status: rc.paying_status(r),
    })),
    not_paying: {
      headers: npHeaders,
      rows: npRows.map(([vals, src]) => [vals.map(fmtVal), src]),
    },
    consents: {
      headers: consHeaders,
      checked: consChecked,
      rows: consRows.map(([vals, src]) => [vals.map(fmtVal), src]),
    },
  };
  process.stdout.write(JSON.stringify(out));
}

void main();
