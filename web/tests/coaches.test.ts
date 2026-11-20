import { describe, it, expect, vi, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import * as rc from '../src/reconcile_core';
import * as co from '../src/coaches';
import { parse_officials } from '../src/club_pdf';
import { WebApp } from '../src/app_ui';

// The PDF module inlines the logos; vitest serves them as paths, so mock them (as in club_pdf.test.ts)
vi.mock('../src/assets/club_logo.png?inline', () => ({ default: 'data:image/png;base64,' }));
vi.mock('../src/assets/fa_badges.png?inline', () => ({ default: 'data:image/png;base64,' }));

const TODAY: rc.LocalDate = { year: 2026, month: 11, day: 20 };

// Laid out like the FA export (invented people and dates): headers on row 10, team columns on each team's first row
const QUAL_ROWS: unknown[][] = [
  ['REPORT TYPE:', 'Team Qualifications Report', null, 'Warning', 'All copies of this extract must be destroyed'],
  ['EXPORTED BY:', 'Test User'],
  ['DATE & TIME:', '13/11/2026 09:58 PM'],
  [], [], ['Information'], ['Qualifications highlighted in red require action'], [], [],
  ['Team Age', 'Team Name', 'Youth team with qualified coach/manager', 'Adult team with first aid in football education',
    'Team Roles', 'FAN', 'Name', 'Highest Coaching Qualification', 'First Aid Expiry', 'Safeguarding Children Expiry',
    'DBS Expiry'],
  ['U8', 'Wilpshire Wanderers U8 Blue', 'Complete', 'N/A', 'Team Coach', '100', 'Christopher Example',
    'Introduction to Coaching Football', 'Expired', '16/04/2028', '14/03/2028'],
  [null, null, null, null, 'Assistant Team Coach', '101', 'Jo Sample', null, 'Not Held', '10/12/2026', '31/01/2027'],
  [null, 'Wilpshire Wanderers U8 Red', 'Incomplete', 'N/A', 'Team Coach', '102', 'Richard Tester',
    'Level 1 in Coaching Football', '03/03/2029', 'Expiring (01/02/2027)', '15/05/2027'],
  ['U9', 'Wilpshire Wanderers U9 Black', 'Complete', 'N/A', 'Team Coach', '102', 'Richard Tester',
    'Level 1 in Coaching Football', '03/03/2029', 'Expiring (01/02/2027)', '15/05/2027'],
  [null, null, null, null, 'Team Manager', '103', 'Pat Unlisted', 'UEFA B Licence', '18/06/2028', '02/02/2028',
    '20/06/2028'],
  [], [],
  ['England Football Accreditation Definitions'],
];

const OFFICIALS: unknown[][] = [
  ['Name', 'Role', 'Second role', 'Exec Member', 'Team(s)', 'Phone'],
  ['Chris Example', 'Manager', null, null, 'U8 Blue', '07700 900111'],
  ['Jo Sample', 'Assistant manager', 'Treasurer', 'Yes', 'U8 Blue', null],
  ['Rick Tester', 'Manager', null, null, 'U8 Red', '07700 900222'],
  ['Sam Missing', 'Assistant manager', null, null, 'U9 Black', null],
  ['Lee Chair', 'Chairman', null, 'Yes', null, null],
];

const report = () => co.parse_qualifications([QUAL_ROWS]);

describe('FA Team Qualifications Report', () => {
  it('reads the report with merged team cells carried down', () => {
    const res = report();
    expect(res.report_date).toBe('13/11/2026 09:58 PM');
    const byName = Object.fromEntries(res.coaches.map((c) => [c.name, c]));
    expect(Object.keys(byName).sort()).toEqual(['Christopher Example', 'Jo Sample', 'Pat Unlisted', 'Richard Tester']);
    expect(byName['Richard Tester'].teams).toEqual(['U8 Red', 'U9 Black']);
    expect(byName['Pat Unlisted'].roles).toEqual(['Team Manager']);
    expect(res.teams.map((t) => [t.team, t.complete])).toEqual([
      ['U8 Blue', 'Complete'], ['U8 Red', 'Incomplete'], ['U9 Black', 'Complete'],
    ]);
    expect(byName['Richard Tester'].certs.safeguarding).toMatchObject({ status: 'expiring', expiry: { year: 2027, month: 2, day: 1 } });
    expect(byName['Christopher Example'].certs.first_aid.status).toBe('expired');
    expect(byName['Jo Sample'].certs.first_aid.status).toBe('not held');
  });

  it('puts each certificate in a band', () => {
    const band = (d: rc.LocalDate) => co.cert_window({ status: 'valid', expiry: d, raw: '' }, TODAY);
    expect(band({ year: 2026, month: 11, day: 19 })).toBe(co.EXPIRED);
    expect(band({ year: 2026, month: 12, day: 20 })).toBe(co.M1);
    expect(band({ year: 2026, month: 12, day: 21 })).toBe(co.M3);
    expect(band({ year: 2027, month: 5, day: 20 })).toBe(co.M6);
    expect(band({ year: 2027, month: 5, day: 21 })).toBe('6 months or more');
    expect(co.add_months({ year: 2026, month: 8, day: 31 }, 6)).toEqual({ year: 2027, month: 2, day: 28 });
  });

  it('filters by band and counts each band', () => {
    const res = report();
    const names = (f: string) => co.coach_rows(res, f, TODAY)[1].map(([v]) => v[0]);
    expect(names('Expired or not held')).toEqual(['Christopher Example', 'Jo Sample']);
    expect(names('Expires within 1 month')).toEqual(['Jo Sample']);
    expect(names('Expires in 1 to 3 months')).toEqual(['Jo Sample', 'Richard Tester']);
    expect(names('Expires in 3 to 6 months')).toEqual(['Richard Tester']);
    expect(names('Expires in 6 months or more')).toEqual(['Pat Unlisted']);
    const totals = Object.fromEntries(co.coaches_totals(res, TODAY));
    expect([totals['Expired'], totals['Not held'], totals['Expires within 1 month'], totals['Expires in 1 to 3 months'],
      totals['Expires in 3 to 6 months'], totals['All three in date for 6 months or more']]).toEqual([1, 1, 1, 2, 1, 1]);
    const bands = Object.fromEntries(co.coach_rows(res, 'All coaches', TODAY)[1].map(([v, b]) => [v[0], b]));
    expect(bands).toEqual({
      'Christopher Example': co.EXPIRED, 'Jo Sample': co.NOT_HELD, 'Richard Tester': co.M3, 'Pat Unlisted': co.OK,
    });
  });

  it('compares with the officials file and builds a WhatsApp reminder', () => {
    const res = co.reconcile_coaches(report(), parse_officials([OFFICIALS]));
    const byName = Object.fromEntries(res.coaches.map((c) => [c.name, c]));
    expect(byName['Christopher Example'].official).toBe('Chris Example');
    expect(byName['Christopher Example'].note).toBe('');
    expect(byName['Richard Tester'].note).toBe('Not listed for U9 Black in the officials file');
    expect(byName['Pat Unlisted'].note).toBe('Not in the officials file');
    expect(res.not_in_fa).toEqual([['Sam Missing', 'Assistant manager', 'U9 Black']]);
    const rick = byName['Richard Tester'];
    expect(rick.phone).toBe('07700 900222');
    expect(co.needs_reminder(rick, TODAY)).toBe(true);
    expect(co.needs_reminder(byName['Pat Unlisted'], TODAY)).toBe(false);
    const text = co.reminder_message(rick, TODAY);
    expect(text.startsWith('Hi Richard, this is a reminder from Wilpshire Wanderers FC')).toBe(true);
    expect(text).toContain('- Safeguarding: expires 01/02/2027 (1 to 3 months)');
    expect(text).toContain('- DBS: expires 15/05/2027 (3 to 6 months)');
    expect(text).not.toContain('First Aid');
    expect(text).toContain(co.TO_DO.dbs);
    expect(co.reminder_message(byName['Christopher Example'], TODAY)).toContain('- First Aid: expired');
  });

  it('matches names and teams the same way as the desktop app', () => {
    expect(co.same_person('Christopher Nestor', 'Chris Nestor')).toBe(true);
    expect(co.same_person('Richard Worden', 'Rick Worden')).toBe(true);
    expect(co.same_person('David Rawlings', 'Dave Rawlings')).toBe(true);
    expect(co.same_person('Chris Holt', 'Chris Nestor')).toBe(false);
    expect(co.same_team('U8 White Sunday', 'U8 White')).toBe(true);
    expect(co.same_team('U8 White', 'U8 Blue')).toBe(false);
  });

  it('rejects a file that is not the report', () => {
    expect(() => co.parse_qualifications([[['First names', 'Surname']]])).toThrow(/Team Qualifications Report/);
  });
});

function makeMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
}

async function xlsx(rows: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet');
  for (const r of rows) ws.addRow(r as ExcelJS.CellValue[]);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf).buffer as ArrayBuffer;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Coaches tab', () => {
  it('runs with only the qualifications report and offers WhatsApp reminders', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new WebApp(root, makeMockStorage());
    app.setChosenFilesForTest(
      null,
      null,
      { name: 'officials.xlsx', buffer: await xlsx(OFFICIALS) },
      { name: 'Club_TeamQualificationReport.xlsx', buffer: await xlsx(QUAL_ROWS) }
    );
    await app.runReconcile();
    expect(app.result).toBeNull();
    expect(app.coaches?.coaches.length).toBe(4);
    expect((root.querySelector('#panel-coaches') as HTMLElement).hidden).toBe(false);
    expect((root.querySelector('#placeholder-coaches') as HTMLElement).hidden).toBe(true);
    const rows = root.querySelectorAll('#tbody-coaches tr');
    expect(rows.length).toBe(4);
    expect((root.querySelector('#btn-export-club-pdf') as HTMLButtonElement).disabled).toBe(false);
    // certificate cells are coloured by band; an expired First Aid is strong red
    const chris = Array.from(rows).find((r) => r.textContent?.includes('Christopher Example')) as HTMLElement;
    expect((chris.children[4] as HTMLElement).style.backgroundColor).toBe('rgb(244, 163, 163)');
    // the reminder button opens a WhatsApp link to the matched phone number
    const rick = Array.from(rows).find((r) => r.textContent?.includes('Richard Tester')) as HTMLElement;
    (rick.querySelector('button.btn-whatsapp-send') as HTMLButtonElement).click();
    const link = root.querySelector('#modal-footer a.btn-whatsapp-send') as HTMLAnchorElement;
    expect(link.href.startsWith('https://wa.me/447700900222?text=Hi%20Richard')).toBe(true);
    app.closeModal();
    // filter to one band
    const select = root.querySelector('#select-coach-filter') as HTMLSelectElement;
    select.value = 'Expires in 3 to 6 months';
    select.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    expect(Array.from(root.querySelectorAll('#tbody-coaches tr')).map((r) => r.children[0].textContent))
      .toEqual(['Richard Tester']);
  });
});
