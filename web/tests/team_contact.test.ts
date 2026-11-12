import { describe, it, expect } from 'vitest';
import { whatsappNumber, whatsappLink } from '../src/team_contact';
import * as staffStore from '../src/staff_store';
import { WebApp } from '../src/app_ui';

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

describe('WhatsApp click-to-chat numbers', () => {
  it.each([
    ['07700 900010', '447700900010'],
    ['07700900010', '447700900010'],
    ['+44 7700 900010', '447700900010'],
    ['0044 7700 900010', '447700900010'],
    ['7700900010', '447700900010'],
    ['07700 900010 / 07700 900011', '447700900010'],
    ['+353 87 123 4567', '353871234567'],
  ])('%s -> %s', (input, expected) => {
    expect(whatsappNumber(input)).toBe(expected);
  });

  it('rejects things that are not phone numbers', () => {
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber('ask Sam')).toBeNull();
    expect(whatsappNumber('01234')).toBeNull();
  });

  it('builds a wa.me link with the message URL-encoded', () => {
    expect(whatsappLink('07700 900010', ' Hi *Alex* & team\n✔ ')).toBe(
      'https://wa.me/447700900010?text=Hi%20*Alex*%20%26%20team%0A%E2%9C%94'
    );
    expect(whatsappLink('07700 900010', '')).toBe('https://wa.me/447700900010');
    expect(whatsappLink('nope', 'hi')).toBeNull();
  });
});

describe('Remember managers list on this device', () => {
  it('is off by default and stores nothing', () => {
    const storage = makeMockStorage();
    const root = document.createElement('div');
    new WebApp(root, storage);
    expect((root.querySelector('#chk-remember-staff') as HTMLInputElement).checked).toBe(false);
    expect(storage.getItem(staffStore.STAFF_STORAGE_KEY)).toBeNull();
  });

  it('remembers the managers file when ticked, restores it next visit and forgets it when unticked', () => {
    const storage = makeMockStorage();
    const csv = new TextEncoder().encode(
      'Name,Role,Team(s),Phone\nAlex Example,Manager,U12 Black,07700900010\n'
    );
    const root = document.createElement('div');
    const app = new WebApp(root, storage);
    app.setChosenFilesForTest(null, null, { name: 'managers.csv', buffer: csv.buffer as ArrayBuffer });
    const chk = root.querySelector('#chk-remember-staff') as HTMLInputElement;
    chk.checked = true;
    chk.dispatchEvent(new Event('change'));
    expect(root.querySelector('#status-staff')?.textContent).toBe('managers.csv (remembered)');

    // Next visit: managers file is already chosen, FA and Thrive are not
    const root2 = document.createElement('div');
    const app2 = new WebApp(root2, storage);
    expect((root2.querySelector('#chk-remember-staff') as HTMLInputElement).checked).toBe(true);
    expect(app2.staffFile?.name).toBe('managers.csv');
    expect(new TextDecoder().decode(app2.staffFile!.buffer)).toContain('Alex Example,Manager');
    expect(app2.faFile).toBeNull();
    expect(app2.thriveFile).toBeNull();
    expect(root2.querySelector('#status-staff')?.textContent).toBe('managers.csv (remembered)');

    // Untick deletes the stored copy
    const chk2 = root2.querySelector('#chk-remember-staff') as HTMLInputElement;
    chk2.checked = false;
    chk2.dispatchEvent(new Event('change'));
    expect(storage.getItem(staffStore.STAFF_STORAGE_KEY)).toBeNull();
    expect(root2.querySelector('#status-staff')?.textContent).toBe('managers.csv');
  });

  it('clearing the managers file deletes the stored copy but keeps the preference', () => {
    const storage = makeMockStorage();
    staffStore.rememberStaff(
      storage,
      { name: 'm.csv', buffer: new Uint8Array([65, 66]).buffer },
      '12/11/2026'
    );
    const root = document.createElement('div');
    new WebApp(root, storage);
    (root.querySelector('#clear-staff') as HTMLButtonElement).click();
    expect(staffStore.isRememberOn(storage)).toBe(true);
    expect(staffStore.loadRememberedStaff(storage)).toBeNull();
  });
});
