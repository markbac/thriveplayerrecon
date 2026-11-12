/**
 * Optional, opt-in copy of the managers file in this browser's localStorage, so it does not need
 * choosing every week. Only the managers file is ever stored here, never the FA or Thrive
 * exports. Unticking "Remember managers list on this device" deletes it.
 */
export const STAFF_STORAGE_KEY = 'PlayerReconcile.managersFile.v1';

/** Managers files are tiny; refuse anything bigger so we never fill the browser's storage. */
export const MAX_REMEMBERED_BYTES = 512 * 1024;

export interface RememberedStaffFile {
  name: string;
  buffer: ArrayBuffer;
  savedAt: string;
}

interface StoredShape {
  remember: true;
  name?: string;
  data?: string;
  savedAt?: string;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromBase64(data: string): ArrayBuffer {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

function read(storage: Storage): StoredShape | null {
  try {
    const raw = storage.getItem(STAFF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || (parsed as StoredShape).remember !== true) {
      return null;
    }
    return parsed as StoredShape;
  } catch {
    return null;
  }
}

/** True when the user has ticked "Remember managers list on this device". */
export function isRememberOn(storage: Storage): boolean {
  return read(storage) !== null;
}

export function loadRememberedStaff(storage: Storage): RememberedStaffFile | null {
  const stored = read(storage);
  if (!stored || typeof stored.name !== 'string' || typeof stored.data !== 'string') return null;
  try {
    return { name: stored.name, buffer: fromBase64(stored.data), savedAt: stored.savedAt || '' };
  } catch {
    return null;
  }
}

/**
 * Turn remembering on and store the file (or just the preference when file is null).
 * Returns an error message for the user, or null on success.
 */
export function rememberStaff(
  storage: Storage,
  file: { name: string; buffer: ArrayBuffer } | null,
  savedAt: string
): string | null {
  const value: StoredShape = { remember: true };
  if (file) {
    if (file.buffer.byteLength > MAX_REMEMBERED_BYTES) {
      try {
        storage.setItem(STAFF_STORAGE_KEY, JSON.stringify(value));
      } catch {
        // ignore
      }
      return `The managers file is too big to remember (over ${MAX_REMEMBERED_BYTES / 1024} KB). Choose it each time instead.`;
    }
    value.name = file.name;
    value.data = toBase64(file.buffer);
    value.savedAt = savedAt;
  }
  try {
    storage.setItem(STAFF_STORAGE_KEY, JSON.stringify(value));
    return null;
  } catch {
    return 'This browser would not let the managers list be saved (private browsing or storage is full).';
  }
}

/** Untick: delete the stored copy and the preference. */
export function forgetStaff(storage: Storage): void {
  try {
    storage.removeItem(STAFF_STORAGE_KEY);
  } catch {
    // ignore
  }
}
