import { describe, it, expect, afterEach } from 'vitest';
import * as rc from '../src/reconcile_core';
import * as cd from '../src/club_data';
import * as excelIo from '../src/excel_io';
import { WebApp } from '../src/app_ui';
import { REF_TODAY, createFaBuffer, createThriveBuffer } from './fixtures';

async function sampleResult(): Promise<rc.Result> {
  return rc.reconcile(
    await excelIo.load_fa(await createFaBuffer()),
    await excelIo.load_thrive(await createThriveBuffer()),
    { ...rc.DEFAULT_TEAM_MAP },
    rc.DEFAULT_FUZZY,
    REF_TODAY
  );
}
const rowFor = (res: rc.Result, name: string) => res.rows.find((r) => r.fa_name === name || r.thrive_name === name)!;
const teamOf = (res: rc.Result, row: rc.Row) =>
  Object.keys(res.teams).find((l) => res.teams[l].some(([, r]) => r === row))!;

describe('Paying outside Thrive', () => {
  it('stores one-way codes that match the desktop app', async () => {
    const dan = rowFor(await sampleResult(), 'Dan Dee');
    expect(cd.paid_id(dan)).toBe('5bd50f81fc42cb1a02e0d1ee6a536b9123c767898695ebedab68b04628cb1ec6'); // as Python
    const marks = cd.mark_paid([], dan, 'direct', REF_TODAY);
    expect(JSON.stringify(marks)).not.toMatch(/Dan|Dee|1005/);
    const again = cd.mark_paid(marks, dan, 'full', REF_TODAY);
    expect(again).toHaveLength(1);
    expect(again[0].kind).toBe('full');
    expect(cd.unmark_paid(again, dan)).toEqual([]);
    expect(cd.clean_paid_marks([{ id: 'a'.repeat(64), kind: 'other' }, 'junk'])).toEqual([]);
  });

  it('shows a paid in full player exactly like an active Thrive mandate', async () => {
    const res = await sampleResult();
    const ben = rowFor(res, 'Ben Bold');
    const amy = rowFor(res, 'Amy Able');
    const label = teamOf(res, ben);
    expect(rc.not_paying_report(res, REF_TODAY)[1].map(([v]) => v[0])).toContain('Ben Bold');
    expect(cd.apply_paid(res, cd.mark_paid([], ben, 'full', REF_TODAY))).toEqual([ben]);
    expect(rc.not_paying_report(res, REF_TODAY)[1].map(([v]) => v[0])).not.toContain('Ben Bold');
    expect(rc.paying_status(ben)).toBe('Yes');
    expect(rc.paying_status(ben)).toBe(rc.paying_status(amy));
    expect(rc._mandate_mark(ben)).toBe(rc._mandate_mark(amy));
    expect(ben.mandate).toBe('Active');
    const [headers, rows] = rc.team_report(res, label, true, REF_TODAY);
    const byName = Object.fromEntries(rows.map(([v]) => [v[0], v]));
    for (const col of ['Thrive mandate', 'Paying through Thrive']) {
      const i = headers.indexOf(col);
      expect(byName['Ben Bold'][i]).toBe(byName['Amy Able'][i]);
    }
    const squad = rc.whatsapp_squad_list(res, label, REF_TODAY, '10:00');
    expect(squad.toLowerCase()).not.toContain('paid in full');
    expect(squad).toContain('0 without');
    expect(rc.whatsapp_not_paying(res).join('\n')).not.toContain('Ben Bold');
  });

  it('says when a player pays the club directly', async () => {
    const res = await sampleResult();
    const dan = rowFor(res, 'Dan Dee');
    cd.apply_paid(res, cd.mark_paid([], dan, 'direct', REF_TODAY));
    expect(rc.paying_status(dan)).toBe('Yes (pays the club directly)');
    expect(dan.result).toBe('FA only');
    expect(rc.not_paying_report(res, REF_TODAY)[1].map(([v]) => v[0])).not.toContain('Dan Dee');
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

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Web app', () => {
  it('marks a player as paid in full from the not paying list and clears it again', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const storage = makeMockStorage();
    const app = new WebApp(root, storage);
    app.setChosenFilesForTest(
      { name: 'fa.xlsx', buffer: (await createFaBuffer()).buffer as ArrayBuffer },
      { name: 'thrive.xlsx', buffer: (await createThriveBuffer()).buffer as ArrayBuffer }
    );
    await app.runReconcile();
    app.closeModal();
    (root.querySelector('#btn-np-paid') as HTMLButtonElement).click();
    const labels = Array.from(root.querySelectorAll('#modal-body label'));
    (labels.find((l) => l.textContent?.includes('paid in full'))!.querySelector('input') as HTMLInputElement).checked = true;
    (labels.find((l) => l.textContent?.includes('Ben Bold'))!.querySelector('input') as HTMLInputElement).checked = true;
    (Array.from(root.querySelectorAll('#modal-footer button')).find((b) => b.textContent === 'Mark as paying') as
      HTMLButtonElement).click();
    expect(app.paidRows.map((r) => r.fa_name)).toEqual(['Ben Bold']);
    expect(rc.paying_status(app.paidRows[0])).toBe('Yes');
    expect(root.querySelector('#tab-btn-paid')?.textContent).toBe('Paying outside Thrive (1)');
    const stored = storage.getItem(cd.STORAGE_KEY) || '';
    expect(stored).toContain('"kind":"full"');
    expect(stored).not.toMatch(/Ben|Bold|1002/);
    (Array.from(root.querySelectorAll('#tbody-paid button')).find((b) => b.textContent === 'Clear mark') as
      HTMLButtonElement).click();
    expect(app.paidRows).toEqual([]);
    expect(rc.not_paying_report(app.result!)[1].map(([v]) => v[0])).toContain('Ben Bold');
  });
});

describe('Club PDF', () => {
  it('shows Club direct and counts it in the summary', async () => {
    const { club_summary, club_totals } = await import('../src/club_pdf');
    const res = await sampleResult();
    const ben = rowFor(res, 'Ben Bold');
    const label = teamOf(res, ben);
    const before = Object.fromEntries(club_totals(res));
    cd.apply_paid(res, cd.mark_paid([], ben, 'direct', REF_TODAY));
    const team = club_summary(res, REF_TODAY).find((t) => t.label === label)!;
    expect(team.players.find((p) => p[0] === 'Ben Bold')![4]).toBe('Club direct');
    expect(team.club_direct).toBe(1);
    expect(team.not_paying).toBe(0);
    const after = Object.fromEntries(club_totals(res));
    expect(after['Paying the club directly']).toBe(1);
    expect(after['Paying through Thrive']).toBe(before['Paying through Thrive']);
    expect(after['Not paying']).toBe(before['Not paying'] - 1);
  });
});
