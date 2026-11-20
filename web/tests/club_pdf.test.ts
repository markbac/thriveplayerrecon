import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as rc from '../src/reconcile_core';
import * as excelIo from '../src/excel_io';
import {
  age_years_months,
  buildClubPdf,
  club_summary,
  club_totals,
  officials_from_staff,
  officials_summary,
  officials_totals,
  parse_officials,
  PDF_HEADERS,
} from '../src/club_pdf';
import { REF_TODAY, born, createFaBuffer, createThriveBuffer } from './fixtures';

// Vite inlines the logos as data URLs in the real build; vitest serves them as paths, so inline them here
vi.mock('../src/assets/club_logo.png?inline', async () => {
  const { readFileSync } = await import('node:fs');
  const data = readFileSync('src/assets/club_logo.png').toString('base64');
  return { default: `data:image/png;base64,${data}` };
});
vi.mock('../src/assets/fa_badges.png?inline', async () => {
  const { readFileSync } = await import('node:fs');
  const data = readFileSync('src/assets/fa_badges.png').toString('base64');
  return { default: `data:image/png;base64,${data}` };
});

async function sampleResult(): Promise<rc.Result> {
  const res = rc.reconcile(
    await excelIo.load_fa(await createFaBuffer()),
    await excelIo.load_thrive(await createThriveBuffer()),
    { ...rc.DEFAULT_TEAM_MAP },
    rc.DEFAULT_FUZZY,
    REF_TODAY
  );
  rc.attach_staff(
    res,
    [new rc.Staff('Alex Example', 'Manager', ['U11 White']), new rc.Staff('Jo Sample', 'Assistant manager', ['U11 White'])],
    rc.DEFAULT_TEAM_MAP
  );
  return res;
}

describe('club PDF', () => {
  it('lists coaches and whether each player is in FA, in Thrive and paying', async () => {
    const res = await sampleResult();
    const teams = club_summary(res, REF_TODAY);
    expect(teams.map((t) => t.label).sort()).toEqual([...rc.team_labels(res)].sort());
    const white = teams.find((t) => t.label === 'U11 White')!;
    expect(white.staff).toEqual([
      ['Manager', 'Alex Example'],
      ['Assistant manager', 'Jo Sample'],
    ]);
    const byName = Object.fromEntries(white.players.map((p) => [p[0], Object.fromEntries(PDF_HEADERS.map((h, i) => [h, p[i]]))]));
    expect(byName['Amy Able']['In FA']).toBe('Registered');
    expect(byName['Amy Able']['Paying']).toBe('Yes');
    expect(byName['Ben Bold']['Paying']).toBe('No');
    expect(byName['Eve East']['In FA']).toBe('No');
    const dan = teams.find((t) => t.label === 'U12 Black')!.players.find((p) => p[0] === 'Dan Dee')!;
    expect(dan.slice(3)).toEqual(['No', 'No']);
  });

  it('counts each club player once, even in two teams', async () => {
    const thrive = await excelIo.load_thrive(
      await createThriveBuffer(undefined, [
        ['Amy', 'Able', born(11, 2), 'U11 White, U12 Black', 'Active', {}],
        ['Ben', 'Bold', born(11, 3), 'U11 White', '', {}],
        ['Tom', 'Train', born(8, 2), 'U08 Black, U7-8 Training', 'Active', {}],
      ])
    );
    const res = rc.reconcile([], thrive, { ...rc.DEFAULT_TEAM_MAP }, rc.DEFAULT_FUZZY, REF_TODAY);
    const totals = Object.fromEntries(club_totals(res));
    expect(totals['Players in the club (each counted once)']).toBe(3);
    expect(totals['Playing in two or more teams (e.g. Saturday and Sunday)']).toBe(1);
    expect(totals['Team places (a player in two teams counts twice)']).toBe(5);
    expect(totals['Paying through Thrive']).toBe(2);
    expect(totals['Not paying']).toBe(1);
  });

  it('puts training groups last', async () => {
    const thrive = await excelIo.load_thrive(
      await createThriveBuffer(undefined, [
        ['Tom', 'Train', born(8, 2), 'U7-8 Training', 'Active', {}],
        ['Amy', 'Able', born(11, 2), 'U11 White', 'Active', {}],
        ['Tia', 'Tiny', born(5, 7, 7), 'U05 26-27', 'Active', {}],
        ['Una', 'Upper', born(10, 4), 'U9-10 Training', 'Active', {}],
      ])
    );
    const res = rc.reconcile(await excelIo.load_fa(await createFaBuffer()), thrive, { ...rc.DEFAULT_TEAM_MAP },
      rc.DEFAULT_FUZZY, REF_TODAY);
    const labels = club_summary(res, REF_TODAY).map((t) => t.label);
    expect(labels.slice(-2)).toEqual(['U7-8 Training (Thrive)', 'U9-10 Training (Thrive)']);
    expect(labels[0].startsWith('U05')).toBe(true);
  });

  it('shows U4-U6 ages in years and months', async () => {
    expect(age_years_months(rc.makeDate(2022, 4, 15), rc.makeDate(2026, 11, 20))).toBe('4y 7m');
    expect(age_years_months(rc.makeDate(2022, 4, 21), rc.makeDate(2026, 11, 20))).toBe('4y 6m');
    const teams = club_summary(await sampleResult(), REF_TODAY);
    const u5 = teams.find((t) => rc.no_fa_age_group(t.label))!;
    expect(u5.players.every((p) => /^\d+y \d+m$/.test(p[1]))).toBe(true);
    expect(teams.find((t) => t.label === 'U11 White')!.players.every((p) => /^\d+$/.test(p[1]))).toBe(true);
  });

  it('builds a PDF with a summary page and one page per team', async () => {
    const res = await sampleResult();
    const bytes = await buildClubPdf(res, new Date(2026, 10, 11, 10, 0));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2 + rc.team_labels(res).length); // summary, officials (from the managers), teams
    expect(doc.getTitle()).toContain('Teams, coaches and players');
  });
});

describe('U4-U6 never map to an FA team', () => {
  it('recognises season-named groups', () => {
    for (const name of ['U04', 'U05', 'U06', 'U05 26-27', 'U06 26-27', 'U6 Tigers']) {
      expect(rc.no_fa_age_group(name)).toBe(true);
    }
    for (const name of ['U07 Eagles', 'U16 Blue', 'Training', 'U7-8 Training']) {
      expect(rc.no_fa_age_group(name)).toBe(false);
    }
  });

  it('overrides a mapping and never counts them as unmapped', async () => {
    const thrive = await excelIo.load_thrive(
      await createThriveBuffer(undefined, [
        ['Tia', 'Tiny', born(5, 7, 7), 'U05 26-27', 'Active', {}],
        ['Max', 'Mini', born(6, 3, 3), 'U06 26-27', '', {}],
      ])
    );
    const map = { ...rc.DEFAULT_TEAM_MAP, 'U05 26-27': rc.CLUB + 'U11 White' };
    const res = rc.reconcile(await excelIo.load_fa(await createFaBuffer()), thrive, map, rc.DEFAULT_FUZZY, REF_TODAY);
    for (const name of ['Tia Tiny', 'Max Mini']) {
      expect(res.rows.find((r) => r.thrive_name === name)!.result).toBe('Thrive only (expected)');
    }
    expect(rc.suggest_mapping(['U05 26-27', 'U06 26-27'], [rc.CLUB + 'U5 26-27'])).toEqual({
      'U05 26-27': rc.IGNORE,
      'U06 26-27': rc.IGNORE,
    });
  });
});

// invented people, in the club officials file layout
const OFFICIALS_ROWS: unknown[][] = [
  ['Name', 'Role', 'Second role', 'Exec Member', 'Team(s)', 'Phone', 'Email'],
  ['Alex Example', 'Manager', null, null, 'U11 White', '07700 900001', null],
  ['Jo Sample', 'Assistant manager', 'Treasurer', 'Yes', 'U11 White', null, null],
  ['Kim Lead', 'Manager', 'U6 Lead', null, 'U8 Blue', null, null],
  ['Pat Chair', 'Chairman', null, 'Yes', null, null, null],
  ['Lee Elder', 'President', null, null, null, null, null],
  [null, 'Social Media Coordinator', null, 'yes', null, null, null],
  ['Sam Small', 'U5 Lead', null, null, null, null, null],
  ['Ray Help', 'U5 Assistant', 'U04 Assistant', null, null, null, null],
  ['Val Liaison', null, 'Club Liaison Officer', 'Yes', 'U12 Black', null, null],
];

describe('club officials page', () => {
  it('groups the officials file into president, executive and teams', () => {
    const officials = parse_officials([OFFICIALS_ROWS]);
    const summary = officials_summary(officials);
    expect(summary.president).toEqual(['Lee Elder']);
    expect(summary.executive).toEqual([
      ['Chairman', 'Pat Chair', ''],
      ['Treasurer', 'Jo Sample', 'Assistant manager (U11 White)'],
      ['Club Liaison Officer', 'Val Liaison', 'Manager (U12 Black)'],
      ['Social Media Coordinator', 'Vacant', ''],
    ]);
    const teams = Object.fromEntries(summary.teams.map(([t, m, a]) => [t, [m, a]]));
    expect(teams['U4']).toEqual([[], ['Ray Help']]);
    expect(teams['U5']).toEqual([['Sam Small'], ['Ray Help']]);
    expect(teams['U6']).toEqual([['Kim Lead'], []]);
    expect(teams['U11 White']).toEqual([['Alex Example'], ['Jo Sample']]);
    expect(teams['U12 Black']).toEqual([['Val Liaison'], []]);
    expect(summary.teams.slice(0, 3).map(([t]) => t)).toEqual(['U4', 'U5', 'U6']);
    expect(Object.fromEntries(officials_totals(officials))).toEqual({
      'Club officials (people)': 8,
      'Executive committee roles': 4,
      'Executive committee roles vacant': 1,
      'Managers and team leads': 4,
      'Assistant managers': 2,
    });
  });

  it('uses the attached managers when there is no officials file, and shows age-group leads on U4-U6 pages', async () => {
    const res = await sampleResult();
    expect(officials_summary(officials_from_staff(res)).teams).toEqual([['U11 White', ['Alex Example'], ['Jo Sample']]]);
    const officials = parse_officials([OFFICIALS_ROWS]);
    const u5 = club_summary(res, REF_TODAY, officials).find((t) => rc.no_fa_age_group(t.label))!;
    expect(u5.staff).toEqual([
      ['U5 Lead', 'Sam Small'],
      ['U5 Assistant', 'Ray Help'],
    ]);
    const doc = await PDFDocument.load(await buildClubPdf(res, new Date(2026, 10, 11, 10, 0), officials));
    expect(doc.getPageCount()).toBe(2 + rc.team_labels(res).length); // summary, officials, one per team
  });
});
