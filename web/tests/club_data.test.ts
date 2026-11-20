import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as rc from '../src/reconcile_core';
import * as cd from '../src/club_data';
import * as co from '../src/coaches';
import * as excelIo from '../src/excel_io';
import { parse_officials } from '../src/club_pdf';
import { WebApp, renderChangelog } from '../src/app_ui';
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
const coach = (name = 'Jo Sample', fan = '101') => ({ fan, name });

describe('Left the club', () => {
  it('stores one-way codes that match the desktop app, and takes the player out', async () => {
    const res = await sampleResult();
    const dan = rowFor(res, 'Dan Dee');
    expect(cd.left_key(dan)).toBe('fan:1005');
    expect(cd.left_id(dan)).toBe('2908b52881dc97994ae1ebb16fa25d0a978544557a473fcebfc29d1e6481da5b'); // as Python
    const marks = cd.mark([], dan, REF_TODAY);
    expect(JSON.stringify(marks)).not.toMatch(/Dan|Dee|1005/);
    expect(cd.mark(marks, dan)).toBe(marks);
    const gone = cd.apply_left(res, marks);
    expect(gone.map((r) => r.fa_name)).toEqual(['Dan Dee']);
    expect(rc.not_paying_report(res, REF_TODAY)[1].map(([v]) => v[0])).not.toContain('Dan Dee');
    expect(Object.values(res.teams).flat().some(([, r]) => r === dan)).toBe(false);
    const [headers, rows] = cd.left_rows_table(gone, marks, REF_TODAY);
    expect(rows[0][0]).toBe('Dan Dee');
    expect(rows[0][headers.indexOf('FAN ID')]).toBe('1005');
    expect(cd.unmark(marks, dan)).toEqual([]);
  });
});

describe('Coach notes and the encrypted club data file', () => {
  it('keeps notes against a hash and merges by the newer note', () => {
    const notes = cd.set_note({}, coach(), '  First Aid course booked  ', REF_TODAY);
    expect(cd.note_for(notes, coach())).toBe('First Aid course booked');
    expect(JSON.stringify(notes)).not.toMatch(/Jo|101/);
    expect(cd.coach_id(coach())).toBe('5b12a48eed98a57e93b5d74eab4e6727940de37fb9b6a4dbd60c28efc2a24a07'); // as Python
    const older = { left_players: [], coach_notes: cd.set_note({}, coach(), 'old', { year: 2026, month: 11, day: 1 }) };
    const newer = { left_players: [], coach_notes: cd.set_note({}, coach(), 'new', { year: 2026, month: 11, day: 5 }) };
    expect(cd.note_for(cd.merge(older, newer).coach_notes, coach())).toBe('new');
  });

  it('round-trips encrypted, rejects a wrong passphrase, and opens the desktop app file', async () => {
    const data = {
      left_players: [{ id: 'a'.repeat(64), marked: '2026-11-20' }],
      coach_notes: cd.set_note({}, coach(), 'DBS renewal started'),
    };
    const text = await cd.exportEncrypted(data, 'a long passphrase');
    expect(text).not.toContain('DBS renewal');
    expect(text).not.toContain('a'.repeat(64));
    expect((await cd.importEncrypted(text, 'a long passphrase')).coach_notes).toEqual(data.coach_notes);
    await expect(cd.importEncrypted(text, 'wrong passphrase')).rejects.toThrow(/Wrong passphrase/);
    await expect(cd.importEncrypted('{"x":1}', 'a long passphrase')).rejects.toThrow(/not a club data file/);
    await expect(cd.exportEncrypted(data, 'short')).rejects.toThrow(/at least 8/);
    const desktop = readFileSync(path.resolve(__dirname, '../../tests/parity/club_data_vector.prdata'), 'utf8');
    const opened = await cd.importEncrypted(desktop, 'correct horse battery');
    expect(cd.note_for(opened.coach_notes, coach())).toBe('Safeguarding course booked');
    expect(opened.left_players[0].id).toBe('2908b52881dc97994ae1ebb16fa25d0a978544557a473fcebfc29d1e6481da5b');
  });

  it('takes notes from the officials file only where the app has none', () => {
    const rows: unknown[][] = [
      ['Name', 'Role', 'Team(s)', 'FAN', 'Notes'],
      ['Rick Tester', 'Manager', 'U8 Red', '102', 'Course booked'],
      ['Chris Example', 'Manager', 'U8 Blue', '', 'Prefers texts'],
    ];
    const coaches = [coach('Richard Tester', '102'), coach('Christopher Example', '100')];
    const [notes, taken] = cd.import_file_notes({}, parse_officials([rows]), coaches, co.same_person, REF_TODAY);
    expect(taken).toBe(2);
    expect(cd.note_for(notes, coaches[0])).toBe('Course booked');
    expect(cd.note_for(notes, coaches[1])).toBe('Prefers texts');
    const [kept, none] = cd.import_file_notes(cd.set_note({}, coaches[0], 'Done'), parse_officials([rows]),
      coaches.slice(0, 1), co.same_person);
    expect(none).toBe(0);
    expect(cd.note_for(kept, coaches[0])).toBe('Done');
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
  it('marks a player as left from the not paying list and puts them back', async () => {
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
    (root.querySelector('#btn-np-left') as HTMLButtonElement).click();
    const label = Array.from(root.querySelectorAll('#modal-body label')).find((l) => l.textContent?.includes('Dan Dee'));
    (label!.querySelector('input') as HTMLInputElement).checked = true;
    (Array.from(root.querySelectorAll('#modal-footer button')).find((b) => b.textContent === 'Mark as left') as
      HTMLButtonElement).click();
    expect(app.leftRows.map((r) => r.fa_name)).toEqual(['Dan Dee']);
    expect(app.result!.rows.some((r) => r.fa_name === 'Dan Dee')).toBe(false);
    expect(root.querySelector('#tab-btn-left')?.textContent).toBe('Left the club (1)');
    const stored = storage.getItem(cd.STORAGE_KEY) || '';
    expect(stored).toContain('2908b528');
    expect(stored).not.toMatch(/Dan|Dee|1005/);
    (Array.from(root.querySelectorAll('#tbody-left button')).find((b) => b.textContent === 'Back in the club') as
      HTMLButtonElement).click();
    expect(app.leftRows).toEqual([]);
    expect(app.result!.rows.some((r) => r.fa_name === 'Dan Dee')).toBe(true);
  });

  it('shows the changelog in About', () => {
    const el = renderChangelog(
      '# Changelog\n\n## [Unreleased]\n\n## [1.2.3] - 2026-11-20\n\n### Added\n- **Bold** thing with `code`\n'
    );
    expect(el.querySelector('h3')?.textContent).toBe('1.2.3 (2026-11-20)');
    expect(el.querySelector('h4')?.textContent).toBe('Added');
    expect(el.querySelector('li strong')?.textContent).toBe('Bold');
    expect(el.querySelector('li code')?.textContent).toBe('code');
    const root = document.createElement('div');
    document.body.appendChild(root);
    new WebApp(root, makeMockStorage());
    (root.querySelector('#nav-about') as HTMLElement).click();
    expect(root.querySelector('#modal-body details.changelog summary')?.textContent).toBe("What's new (changelog)");
    expect(root.querySelectorAll('#modal-body .changelog-body h3').length).toBeGreaterThan(3);
  });
});
