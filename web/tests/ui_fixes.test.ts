import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebApp } from '../src/app_ui';
import { createFaBuffer, createThriveBuffer } from './fixtures';

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

async function reconciledApp(): Promise<{ app: WebApp; root: HTMLElement }> {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = new WebApp(root, makeMockStorage());
  const fa = await createFaBuffer();
  const th = await createThriveBuffer();
  app.setChosenFilesForTest(
    { name: 'fa.xlsx', buffer: fa.buffer as ArrayBuffer },
    { name: 'thrive.xlsx', buffer: th.buffer as ArrayBuffer }
  );
  await app.runReconcile();
  app.closeModal();
  return { app, root };
}

function clickContinue(root: HTMLElement): void {
  (Array.from(root.querySelectorAll('#modal-footer button')).find(
    (b) => b.textContent === 'Continue'
  ) as HTMLButtonElement).click();
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Review fixes', () => {
  // First: keydown listeners stay on window, so run this before other apps with files exist
  it('leaves Ctrl+R to the browser until both files are chosen, and while typing', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new WebApp(root, makeMockStorage());
    const spy = vi.spyOn(app, 'runReconcile');
    const ev = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(spy).not.toHaveBeenCalled();

    const { app: ready, root: readyRoot } = await reconciledApp();
    const spy2 = vi.spyOn(ready, 'runReconcile').mockResolvedValue();
    const search = readyRoot.querySelector('#results-search') as HTMLInputElement;
    const typing = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true, bubbles: true });
    search.dispatchEvent(typing);
    expect(typing.defaultPrevented).toBe(false);
    const ev2 = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true });
    window.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(true);
    expect(spy2).toHaveBeenCalled();
  });
  it('moves focus into dialogs, keeps Tab inside them and returns focus on close', async () => {
    const { root } = await reconciledApp();
    const opener = root.querySelector('#btn-np-whatsapp') as HTMLButtonElement;
    opener.focus();
    opener.click();
    const backdrop = root.querySelector('#modal-backdrop') as HTMLElement;
    expect(backdrop.hidden).toBe(false);
    expect(backdrop.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toBe('Continue');

    // Tab from the last control wraps to the first, Shift+Tab from the first wraps to the last
    const focusables = Array.from(backdrop.querySelectorAll('button')) as HTMLElement[];
    focusables[focusables.length - 1].focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(document.activeElement).toBe(focusables[0]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(backdrop.hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('makes column headings keyboard sortable with aria-sort', async () => {
    const { app, root } = await reconciledApp();
    app.switchTab('not-paying');
    const th = root.querySelector('#thead-np th') as HTMLElement;
    expect(th.tabIndex).toBe(0);
    expect(th.getAttribute('aria-sort')).toBe('none');
    th.focus();
    th.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const sorted = root.querySelector('#thead-np th') as HTMLElement;
    expect(sorted.getAttribute('aria-sort')).toBe('ascending');
    expect(document.activeElement).toBe(sorted);
    const resTh = root.querySelector('#thead-results th') as HTMLElement;
    expect(resTh.tabIndex).toBe(0);
  });

  it('says when copying failed instead of claiming success', async () => {
    const { root } = await reconciledApp();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    (root.querySelector('#btn-np-whatsapp') as HTMLButtonElement).click();
    clickContinue(root);
    const copyBtn = Array.from(root.querySelectorAll('#modal-footer button')).find(
      (b) => b.textContent === 'Copy to clipboard'
    ) as HTMLButtonElement;
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.querySelector('#status-bar-text')?.textContent).toContain('Could not copy automatically');

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.querySelector('#status-bar-text')?.textContent).toBe('Copied. Paste it into WhatsApp.');
  });

  it('shows a message when an export fails instead of failing silently', async () => {
    const { app, root } = await reconciledApp();
    // Break the result so building the workbook throws
    (app.result as unknown as { rows: unknown }).rows = null;
    (root.querySelector('#btn-np-export') as HTMLButtonElement).click();
    clickContinue(root);
    await vi.waitFor(() => {
      expect(root.querySelector('#modal-title')?.textContent).toBe('Something went wrong');
    });
    expect(root.querySelector('#status-bar-text')?.textContent).toContain('Nothing was saved');
  });

});
