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
    expect(root.querySelector('#version-badge')?.textContent).toBe('v1.5.2');
    expect(root.querySelector('#build-date-badge')?.textContent).toContain('Created ');
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
      { name: 'FA Player Export 2026 (1).xlsx ', buffer: faBytes.buffer as ArrayBuffer },
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
      { name: 'FA Player Export 2026 (1).xlsx ', buffer: faBytes.buffer as ArrayBuffer },
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

    // Verify zero inline style="" attributes so strict style-src 'self' CSP never blocks styles
    expect(root.querySelectorAll('[style]').length).toBe(0);

    document.body.removeChild(root);
  });

  it('supports mobile phone / Pixel 10 Pro UX: auto-collapsing steps bar, mobile view picker, and native Web Share', async () => {
    const origWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 412, // Pixel 10 Pro viewport width
    });

    const shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      writable: true,
      configurable: true,
      value: shareSpy,
    });

    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new WebApp(root, makeMockStorage());

    const faBytes = await createFaBuffer();
    const thBytes = await createThriveBuffer();
    app.setChosenFilesForTest(
      { name: 'FA Player Export 2026 (1).xlsx ', buffer: faBytes.buffer as ArrayBuffer },
      { name: 'thrive.xlsx', buffer: thBytes.buffer as ArrayBuffer }
    );
    await app.runReconcile();

    // Steps grid automatically collapsed into compact summary bar on 412px mobile viewport
    const stepsGrid = root.querySelector('#steps-grid') as HTMLElement;
    const collapsedBar = root.querySelector('#steps-collapsed-bar') as HTMLElement;
    expect(stepsGrid.hidden).toBe(true);
    expect(collapsedBar.hidden).toBe(false);
    expect(root.querySelector('#steps-collapsed-summary')?.textContent).toBe(
      '✔ Reconciled (6 FA, 6 Thrive)'
    );

    // Expanding and re-collapsing steps works
    (root.querySelector('#btn-expand-steps') as HTMLButtonElement).click();
    expect(stepsGrid.hidden).toBe(false);
    expect(collapsedBar.hidden).toBe(true);

    (root.querySelector('#btn-collapse-steps') as HTMLButtonElement).click();
    expect(stepsGrid.hidden).toBe(true);
    expect(collapsedBar.hidden).toBe(false);

    // Mobile view selector dropdown switches Results view and updates counts
    const mobileSelect = root.querySelector('#select-mobile-view') as HTMLSelectElement;
    expect(mobileSelect.value).toBe('All players');
    mobileSelect.value = 'Needs attention';
    mobileSelect.dispatchEvent(new Event('change'));
    expect(root.querySelector('#results-view-title')?.textContent).toBe('Needs attention');
    expect(root.querySelectorAll('#tbody-results tr').length).toBe(3);

    // Mobile fuzziness input syncs with desktop fuzziness input
    const mobileFuzzy = root.querySelector('#input-fuzzy-mobile') as HTMLInputElement;
    mobileFuzzy.value = '0.75';
    mobileFuzzy.dispatchEvent(new Event('change'));
    expect((root.querySelector('#input-fuzzy') as HTMLInputElement).value).toBe('0.75');

    // Native "Share to app..." button appears in WhatsApp modal when navigator.share is available
    app.switchTab('not-paying');
    (root.querySelector('#btn-np-whatsapp') as HTMLButtonElement).click();
    // Confirm UK GDPR modal first
    const confirmBtns = Array.from(root.querySelectorAll('#modal-footer button'));
    const continueBtn = confirmBtns.find((b) => b.textContent === 'Continue') as HTMLButtonElement;
    continueBtn.click();

    const shareBtn = root.querySelector('.btn-share-native') as HTMLButtonElement;
    expect(shareBtn).toBeTruthy();
    expect(shareBtn.textContent).toBe('Share to app...');
    shareBtn.click();
    expect(shareSpy).toHaveBeenCalledTimes(1);
    app.closeModal();

    // Verify (a) manager name in brackets on team selector box and (b) per-team Copy payment for WhatsApp
    const staffCsv = new TextEncoder().encode(
      'Name,Role,Team(s),Phone\nAlex Example,Manager,U12 Black,07700900010\nPat Sample,Assistant manager,U11 White,07700900011\n'
    );
    app.setChosenFilesForTest(
      { name: 'fa.xlsx', buffer: faBytes.buffer as ArrayBuffer },
      { name: 'thrive.xlsx', buffer: thBytes.buffer as ArrayBuffer },
      { name: 'managers.csv', buffer: staffCsv.buffer as ArrayBuffer }
    );
    await app.runReconcile();

    app.switchTab('teams');
    const selectTeam = root.querySelector('#select-team') as HTMLSelectElement;
    const optionTexts = Array.from(selectTeam.options).map((o) => o.textContent);
    expect(optionTexts).toContain('U12 Black (Alex Example)');
    expect(optionTexts).toContain('U11 White');

    // Select U12 Black (where Dan Dee is FA only / missing from Thrive) and open Copy payment for WhatsApp
    selectTeam.value = 'U12 Black';
    selectTeam.dispatchEvent(new Event('change'));
    (root.querySelector('#btn-team-whatsapp-payment') as HTMLButtonElement).click();
    const confirmBtns2 = Array.from(root.querySelectorAll('#modal-footer button'));
    (confirmBtns2.find((b) => b.textContent === 'Continue') as HTMLButtonElement).click();

    const waTextarea = root.querySelector('.whatsapp-textarea') as HTMLTextAreaElement;
    expect(waTextarea.value).toContain('*Currently not paying fees*: U12 Black');
    expect(waTextarea.value).toContain('Dan Dee (U12 Black)');
    expect(waTextarea.value).toContain(
      'Registered with FA ✅  Signed up in Thrive (membership) ❌  Active Direct Debit mandate ❌'
    );
    app.closeModal();

    // Select U11 White (where Ben Bold is in Thrive with no active direct debit) and open Copy payment for WhatsApp
    selectTeam.value = 'U11 White';
    selectTeam.dispatchEvent(new Event('change'));
    (root.querySelector('#btn-team-whatsapp-payment') as HTMLButtonElement).click();
    const confirmBtns3 = Array.from(root.querySelectorAll('#modal-footer button'));
    (confirmBtns3.find((b) => b.textContent === 'Continue') as HTMLButtonElement).click();

    const waTextarea2 = root.querySelector('.whatsapp-textarea') as HTMLTextAreaElement;
    expect(waTextarea2.value).toContain('*Currently not paying fees*: U11 White');
    expect(waTextarea2.value).toContain('Ben Bold (U11 White)');
    expect(waTextarea2.value).toContain(
      'Registered with FA ✅  Signed up in Thrive (membership) ✅  Active Direct Debit mandate ❌'
    );
    expect(waTextarea2.value).toContain('https://member.thrive4.com/');
    expect(waTextarea2.value).toContain(
      'https://book.thrive4.com/#/app/joinin/organisation/shop/a8b9edae-1af1-4df8-afe5-73e73f066998'
    );
    expect(waTextarea2.value).toContain('Open Payment Settings');
    app.closeModal();

    document.body.removeChild(root);
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: origWidth,
    });
  });
});
