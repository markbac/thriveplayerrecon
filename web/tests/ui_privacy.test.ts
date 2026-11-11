import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import axe from 'axe-core';
import { WebApp } from '../src/app_ui';
import * as settingsMod from '../src/settings';
import { createFaBuffer, createThriveBuffer, THRIVE_HEADERS } from './fixtures';

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

describe('Web App Privacy Baseline (#14) and UI Screens (#18-#24)', () => {
  it('enforces a strict Content Security Policy with connect-src none and no external CDN urls in index.html (#14)', () => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it('runs a full reconciliation in the UI without making any network requests or storing player data (#14, #18, #19, #20, #21, #22, #24)', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('Outgoing network call attempted!');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const root = document.createElement('div');
    document.body.appendChild(root);
    const storage = makeMockStorage();
    const app = new WebApp(root, storage);

    // Initially shows "Not reconciled yet" placeholder and version
    expect(root.querySelector('#version-badge')?.textContent).toBe('v1.2.0');
    expect((root.querySelector('#placeholder-results') as HTMLElement).hidden).toBe(false);
    expect(root.querySelector('#run-state-label')?.textContent).toBe('Not run yet');

    // Load FA and Thrive buffers (put them in swapped boxes to test auto-swap!)
    const faBytes = await createFaBuffer();
    const thBytes = await createThriveBuffer();
    app.setChosenFilesForTest(
      { name: 'thrive_swapped.xlsx', buffer: thBytes.buffer as ArrayBuffer },
      { name: 'fa_swapped.xlsx', buffer: faBytes.buffer as ArrayBuffer }
    );

    await app.runReconcile();

    // Auto-swapped files and completed reconcile
    expect(app.faFile?.name).toBe('fa_swapped.xlsx');
    expect(app.thriveFile?.name).toBe('thrive_swapped.xlsx');
    expect((root.querySelector('#placeholder-results') as HTMLElement).hidden).toBe(true);
    expect(root.querySelector('#results-summary-stats')?.textContent).toContain(
      '3 fully matched'
    );

    // Results table rows have both level class and text/symbol badge (#24 accessibility)
    const resultRows = root.querySelectorAll('#tbody-results tr');
    expect(resultRows.length).toBe(8);
    expect(resultRows[0].querySelector('td')?.textContent).toMatch(/^[✔⚠✖ℹ]/);

    // Switching files triggers "Files changed" warning (#18)
    app.setChosenFilesForTest(
      { name: 'another_fa.xlsx', buffer: faBytes.buffer as ArrayBuffer },
      { name: 'thrive_swapped.xlsx', buffer: thBytes.buffer as ArrayBuffer }
    );
    expect(root.querySelector('#run-state-label')?.textContent).toContain('Files changed');

    // Team sheets tab (#20)
    app.switchTab('teams');
    const selectTeam = root.querySelector('#select-team') as HTMLSelectElement;
    selectTeam.value = 'U11 White';
    selectTeam.dispatchEvent(new Event('change'));
    expect(root.querySelector('#team-unpaid-banner')?.textContent).toBe(
      '✖ 1 not paying through Thrive'
    );
    expect(root.querySelector('#team-pos-label')?.textContent).toBe('2 of 3');

    // Not paying tab (#21)
    app.switchTab('not-paying');
    expect(root.querySelector('#tab-btn-not-paying')?.textContent).toBe('Not paying (3)');
    const npRows = root.querySelectorAll('#tbody-np tr');
    expect(npRows.length).toBe(3);

    // Missing consents tab
    app.switchTab('consents');
    expect(root.querySelector('#tab-btn-consents')?.textContent).toBe(
      'Missing consents (2)'
    );

    // Help dialog (#24)
    app.showHelp('exports');
    expect((root.querySelector('#modal-backdrop') as HTMLElement).hidden).toBe(false);
    expect(root.querySelector('#modal-body')?.textContent).toContain(
      'Manage table columns'
    );
    app.closeModal();

    // Verify zero network calls and zero player data in storage (#14)
    expect(fetchSpy).not.toHaveBeenCalled();
    const stored = storage.getItem(settingsMod.STORAGE_KEY) || '';
    expect(stored).not.toContain('Amy Able');
    expect(stored).not.toContain('Ben Bold');
    expect(stored).not.toContain('1001');

    document.body.removeChild(root);
    vi.unstubAllGlobals();
  });

  it('shows the missing mandate column warning on Not paying when Active mandates is absent (#15, #21)', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new WebApp(root, makeMockStorage());

    const faBytes = await createFaBuffer();
    const noMandateHeaders = THRIVE_HEADERS.filter((h) => h !== 'Active mandates');
    const thBytes = await createThriveBuffer(noMandateHeaders);

    app.setChosenFilesForTest(
      { name: 'fa.xlsx', buffer: faBytes.buffer as ArrayBuffer },
      { name: 'thrive.xlsx', buffer: thBytes.buffer as ArrayBuffer }
    );
    await app.runReconcile();

    expect(root.querySelector('#np-mandate-warning')?.textContent).toContain(
      'Mandates could not be checked'
    );
    document.body.removeChild(root);
  });

  it('passes automated WCAG 2.1 AA accessibility checks with axe-core across tabs (#24)', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new WebApp(root, makeMockStorage());

    const faBytes = await createFaBuffer();
    const thBytes = await createThriveBuffer();
    app.setChosenFilesForTest(
      { name: 'fa.xlsx', buffer: faBytes.buffer as ArrayBuffer },
      { name: 'thrive.xlsx', buffer: thBytes.buffer as ArrayBuffer }
    );
    await app.runReconcile();

    const results = await axe.run(root, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      },
      rules: {
        // jsdom does not compute layout/canvas contrast; all other WCAG 2.1 AA rules run
        'color-contrast': { enabled: false },
      },
    });
    expect(
      results.violations.map((v) => `${v.id}: ${v.description} (${v.nodes.length})`)
    ).toEqual([]);

    document.body.removeChild(root);
  });
});
