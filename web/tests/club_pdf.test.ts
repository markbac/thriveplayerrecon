import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as rc from '../src/reconcile_core';
import * as excelIo from '../src/excel_io';
import { buildClubPdf, club_summary, PDF_HEADERS } from '../src/club_pdf';
import { REF_TODAY, born, createFaBuffer, createThriveBuffer } from './fixtures';

// Vite inlines the logos as data URLs in the real build; vitest serves them as paths, so inline them here
vi.mock('../src/assets/club_badge.jpg?inline', async () => {
  const { readFileSync } = await import('node:fs');
  const data = readFileSync('src/assets/club_badge.jpg').toString('base64');
  return { default: `data:image/jpeg;base64,${data}` };
});
vi.mock('../src/assets/accredited_club.png?inline', async () => {
  const { readFileSync } = await import('node:fs');
  const data = readFileSync('src/assets/accredited_club.png').toString('base64');
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
    expect(teams.map((t) => t.label)).toEqual(rc.team_labels(res));
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

  it('builds a PDF with a summary page and one page per team', async () => {
    const res = await sampleResult();
    const bytes = await buildClubPdf(res, new Date(2026, 10, 11, 10, 0));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1 + rc.team_labels(res).length);
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
