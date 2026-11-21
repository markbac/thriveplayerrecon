/**
 * Club data kept between runs: players marked as left the club or as paying outside Thrive (one-way hashes) and
 * notes on coaches (kept against
 * a one-way hash of the coach's FAN ID), stored in this browser under its own key. It can be moved to another
 * computer in an encrypted file: AES-256-GCM with a key from the passphrase (PBKDF2-SHA256), the same format as the
 * desktop app (src/club_data.py, src/left_club.py and src/paid_outside.py), so either app opens the other's file.
 * Nothing is uploaded.
 */
import * as rc from './reconcile_core';

export const STORAGE_KEY = 'PlayerReconcile.clubdata.v1';
export const FORMAT = 'PlayerReconcile club data';
export const ITERATIONS = 310000;
const LEFT_SALT = 'PlayerReconcile-left-v1|';
const COACH_SALT = 'PlayerReconcile-coach-v1|';
const PAID_SALT = 'PlayerReconcile-paid-v1|';
export const MAX_NOTE = 2000;

export interface LeftMark {
  id: string;
  marked: string;
}
export type PaidKind = 'direct' | 'full';
export interface PaidMark {
  id: string;
  kind: PaidKind;
  marked: string;
}
export interface CoachNote {
  note: string;
  updated: string;
}
export interface ClubData {
  left_players: LeftMark[];
  coach_notes: Record<string, CoachNote>;
  /** Players marked as paying outside Thrive (missing in files from before this existed). */
  paid_outside?: PaidMark[];
}

export class ClubDataError extends Error {}

// --------------------------------------------------------------------------- SHA-256 (synchronous)

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

/** SHA-256 of a UTF-8 string as lower-case hex (synchronous, so it can run inside the reconcile step). */
export function sha256Hex(text: string): string {
  const msg = new TextEncoder().encode(text);
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, (x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// --------------------------------------------------------------------------- left the club

const isoDate = (d: rc.LocalDate) =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/** 'fan:1234567', or 'name:amy able|2015-02-01' for a player with no FAN ID. */
export function left_key(row: rc.Row): string {
  const fan = (row.fa ? row.fa.fan_id : '') || row.fan_id;
  if (fan) {
    const digits = String(fan).replace(/\D/g, '');
    return 'fan:' + (digits || String(fan).trim());
  }
  const name = (row.fa_name || row.thrive_name).toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  const dob = row.fa_dob ?? row.thrive_dob;
  return `name:${name}|${dob ? isoDate(dob) : ''}`;
}

export function left_id(row: rc.Row): string {
  return sha256Hex(LEFT_SALT + left_key(row));
}

export function clean_marks(raw: unknown): LeftMark[] {
  const out: LeftMark[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? '');
    const marked = String(o.marked ?? '');
    if (/^[0-9a-f]{64}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      out.push({ id, marked: /^\d{4}-\d{2}-\d{2}$/.test(marked) ? marked : '' });
    }
  }
  return out;
}

export function mark(marks: LeftMark[], row: rc.Row, today: rc.LocalDate = rc.todayLocalDate()): LeftMark[] {
  const id = left_id(row);
  return marks.some((m) => m.id === id) ? marks : [...marks, { id, marked: isoDate(today) }];
}

export function unmark(marks: LeftMark[], row: rc.Row): LeftMark[] {
  const id = left_id(row);
  return marks.filter((m) => m.id !== id);
}

/** Take the marked players out of result.rows and result.teams (teams left empty are dropped). Returns the players
 * taken out, for the Left the club list. */
export function apply_left(result: rc.Result, marks: LeftMark[]): rc.Row[] {
  const ids = new Set(marks.map((m) => m.id));
  if (!ids.size) return [];
  const gone = result.rows.filter((r) => ids.has(left_id(r)));
  if (!gone.length) return [];
  const goneSet = new Set(gone);
  result.rows = result.rows.filter((r) => !goneSet.has(r));
  for (const label of Object.keys(result.teams)) {
    result.teams[label] = result.teams[label].filter(([, r]) => !goneSet.has(r));
    if (!result.teams[label].length) delete result.teams[label];
  }
  return gone;
}

export function unmatched_marks(marks: LeftMark[], leftRows: rc.Row[]): number {
  const found = new Set(leftRows.map(left_id));
  return marks.filter((m) => !found.has(m.id)).length;
}

export const LEFT_HEADERS = ['Player', 'DOB', 'Age', 'Team(s)', 'FAN ID', 'FA status', 'In Thrive', 'Marked as left'];
export const LEFT_NOTE =
  'Players marked as left the club. They are left out of the results, team sheets, the not paying list, counts and ' +
  'the club PDF. Release them in the Whole Game System (Players > select the player > Release) so they drop off the ' +
  'FA report, then unmark them here.';

export function left_rows_table(leftRows: rc.Row[], marks: LeftMark[], today: rc.LocalDate = rc.todayLocalDate()):
  [string[], string[][]] {
  const when = new Map(marks.map((m) => [m.id, m.marked]));
  const rows = leftRows.map((r) => {
    const [name, dob, age] = rc._name_dob(r, today);
    const marked = when.get(left_id(r)) || '';
    return [name, rc.formatDate(dob), String(age), r.fa_teams || r.thrive_teams || r.expected_fa_teams,
      (r.fa ? r.fa.fan_id : '') || r.fan_id, r.fa_status || (r.fa ? '' : 'Not in the FA report'),
      r.th ? 'Yes' : 'No', marked ? marked.split('-').reverse().join('/') : ''];
  });
  const surname = (n: string) => (n.split(/\s+/).filter(Boolean).pop() || '').toLowerCase();
  rows.sort((a, b) => a[3].toLowerCase().localeCompare(b[3].toLowerCase()) || surname(a[0]).localeCompare(surname(b[0])));
  return [LEFT_HEADERS, rows];
}

// --------------------------------------------------------------------------- paying outside Thrive
// Players who pay the club directly, or have already paid in full. Marked players count as paying: they are not on
// the Not paying list or in the not paying messages. Paid in full shows exactly like an active Thrive mandate.

export const PAID_KINDS: Record<PaidKind, string> = { direct: rc.PAID_DIRECT, full: rc.PAID_IN_FULL };
export const PAID_NOTE =
  'Players marked as paying outside Thrive: they pay the club directly, or have already paid in full. They count ' +
  'as paying, so they are not on the Not paying list or in the not paying WhatsApp messages. Clear a mark when it ' +
  'no longer applies (for example a new season).';

export function paid_id(row: rc.Row): string {
  return sha256Hex(PAID_SALT + left_key(row));
}

export function clean_paid_marks(raw: unknown): PaidMark[] {
  const out: PaidMark[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? '').toLowerCase();
    const kind = String(o.kind ?? '');
    const marked = String(o.marked ?? '');
    if (/^[0-9a-f]{64}$/.test(id) && (kind === 'direct' || kind === 'full') && !seen.has(id)) {
      seen.add(id);
      out.push({ id, kind, marked: /^\d{4}-\d{2}-\d{2}$/.test(marked) ? marked : '' });
    }
  }
  return out;
}

/** Mark the player (replacing any earlier mark of the other kind). */
export function mark_paid(marks: PaidMark[], row: rc.Row, kind: PaidKind,
  today: rc.LocalDate = rc.todayLocalDate()): PaidMark[] {
  const id = paid_id(row);
  return [...marks.filter((m) => m.id !== id), { id, kind, marked: isoDate(today) }];
}

export function unmark_paid(marks: PaidMark[], row: rc.Row): PaidMark[] {
  const id = paid_id(row);
  return marks.filter((m) => m.id !== id);
}

/** Set Row.paid_outside on the marked players. Returns the marked players, for the Paying outside Thrive list. */
export function apply_paid(result: rc.Result, marks: PaidMark[]): rc.Row[] {
  const kinds = new Map(marks.map((m) => [m.id, m.kind]));
  const found: rc.Row[] = [];
  for (const r of result.rows) {
    const kind = kinds.get(paid_id(r));
    r.paid_outside = kind ? PAID_KINDS[kind] : '';
    if (r.paid_outside) {
      found.push(r);
      if (r.paid_outside === rc.PAID_IN_FULL && r.th) r.mandate = rc._mandate_text(r);
    }
  }
  return found;
}

export function unmatched_paid_marks(marks: PaidMark[], paidRows: rc.Row[]): number {
  const found = new Set(paidRows.map(paid_id));
  return marks.filter((m) => !found.has(m.id)).length;
}

export const PAID_HEADERS = ['Player', 'DOB', 'Age', 'Team(s)', 'Paying', 'In Thrive', 'Thrive mandate', 'Marked'];

export function paid_rows_table(paidRows: rc.Row[], marks: PaidMark[], today: rc.LocalDate = rc.todayLocalDate()):
  [string[], string[][]] {
  const when = new Map(marks.map((m) => [m.id, m.marked]));
  const rows = paidRows.map((r) => {
    const [name, dob, age] = rc._name_dob(r, today);
    const marked = when.get(paid_id(r)) || '';
    return [name, rc.formatDate(dob), String(age), r.fa_teams || r.thrive_teams || r.expected_fa_teams,
      r.paid_outside, r.th ? 'Yes' : 'No', !r.th ? 'Not in Thrive' : r.th.mandate || 'None',
      marked ? marked.split('-').reverse().join('/') : ''];
  });
  const surname = (n: string) => (n.split(/\s+/).filter(Boolean).pop() || '').toLowerCase();
  rows.sort((a, b) => a[3].toLowerCase().localeCompare(b[3].toLowerCase()) || surname(a[0]).localeCompare(surname(b[0])));
  return [PAID_HEADERS, rows];
}

// --------------------------------------------------------------------------- coach notes

export function coach_id(coach: { fan: string; name: string }): string {
  const digits = (coach.fan || '').replace(/\D/g, '');
  const key = digits ? `fan:${digits}` : `name:${coach.name.toLowerCase().split(/\s+/).filter(Boolean).join(' ')}`;
  return sha256Hex(COACH_SALT + key);
}

export function clean_notes(raw: unknown): Record<string, CoachNote> {
  const out: Record<string, CoachNote> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-9a-f]{64}$/.test(key) || !value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const note = String(v.note ?? '').trim().slice(0, MAX_NOTE);
    const updated = String(v.updated ?? '');
    if (note) out[key] = { note, updated: /^\d{4}-\d{2}-\d{2}$/.test(updated) ? updated : '' };
  }
  return out;
}

export function set_note(
  notes: Record<string, CoachNote>,
  coach: { fan: string; name: string },
  text: string,
  today: rc.LocalDate = rc.todayLocalDate()
): Record<string, CoachNote> {
  const out = { ...notes };
  const note = text.trim().slice(0, MAX_NOTE);
  if (note) out[coach_id(coach)] = { note, updated: isoDate(today) };
  else delete out[coach_id(coach)];
  return out;
}

export function note_for(notes: Record<string, CoachNote>, coach: { fan: string; name: string }): string {
  return notes[coach_id(coach)]?.note || '';
}

const digitsOf = (text: string | undefined) => (text || '').replace(/\D/g, '');

/** Notes from the officials file's Notes column, matched to coaches by FAN ID (or by name). A file note is only
 * taken when the app has no note for that coach, so an older file never overwrites a newer note. */
export function import_file_notes(
  notes: Record<string, CoachNote>,
  officials: Array<{ name: string; fan?: string; note?: string }>,
  coaches: Array<{ fan: string; name: string }>,
  samePerson: (a: string, b: string) => boolean,
  today: rc.LocalDate = rc.todayLocalDate()
): [Record<string, CoachNote>, number] {
  const out = { ...notes };
  let taken = 0;
  for (const o of officials) {
    const text = (o.note || '').trim();
    if (!text) continue;
    const coach = coaches.find((c) => digitsOf(o.fan) && digitsOf(o.fan) === digitsOf(c.fan)) ??
      coaches.find((c) => o.name && samePerson(c.name, o.name));
    if (coach && !out[coach_id(coach)]) {
      out[coach_id(coach)] = { note: text.slice(0, MAX_NOTE), updated: isoDate(today) };
      taken++;
    }
  }
  return [out, taken];
}

/** Combine club data: every left-the-club mark from both, the newer paying outside Thrive mark for each player,
 * and for each coach the newer note. */
export function merge(current: ClubData, incoming: ClubData): ClubData {
  const marks = clean_marks(current.left_players);
  const known = new Set(marks.map((m) => m.id));
  for (const m of clean_marks(incoming.left_players)) if (!known.has(m.id)) marks.push(m);
  const notes = clean_notes(current.coach_notes);
  for (const [key, value] of Object.entries(clean_notes(incoming.coach_notes))) {
    if (!notes[key] || value.updated >= notes[key].updated) notes[key] = value;
  }
  const paid = new Map(clean_paid_marks(current.paid_outside).map((m) => [m.id, m]));
  for (const m of clean_paid_marks(incoming.paid_outside)) {
    const had = paid.get(m.id);
    if (!had || m.marked >= had.marked) paid.set(m.id, m);
  }
  return { left_players: marks, coach_notes: notes, paid_outside: [...paid.values()] };
}

// --------------------------------------------------------------------------- browser storage

export function loadClubData(storage: Storage): ClubData {
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    return { left_players: clean_marks(raw.left_players), coach_notes: clean_notes(raw.coach_notes),
      paid_outside: clean_paid_marks(raw.paid_outside) };
  } catch {
    return { left_players: [], coach_notes: {}, paid_outside: [] };
  }
}

export function saveClubData(storage: Storage, data: ClubData): void {
  try {
    const clean = { left_players: clean_marks(data.left_players), coach_notes: clean_notes(data.coach_notes),
      paid_outside: clean_paid_marks(data.paid_outside) };
    if (!clean.left_players.length && !Object.keys(clean.coach_notes).length && !clean.paid_outside.length) {
      storage.removeItem(STORAGE_KEY);
    } else storage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // storage full or blocked (private browsing): the marks last until the page is closed
  }
}

// --------------------------------------------------------------------------- encrypted file

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false,
    ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** The club data as an encrypted JSON file (only the format name and settings are readable). */
export async function exportEncrypted(data: ClubData, passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new ClubDataError('Use a passphrase of at least 8 characters.');
  const payload = {
    left_players: clean_marks(data.left_players), coach_notes: clean_notes(data.coach_notes),
    paid_outside: clean_paid_marks(data.paid_outside), exported: isoDate(rc.todayLocalDate()),
  };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(FORMAT) }, key,
    new TextEncoder().encode(JSON.stringify(payload))));
  return JSON.stringify({
    format: FORMAT, version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, cipher: 'AES-256-GCM',
    salt: b64(salt), iv: b64(iv), data: b64(sealed),
  }, null, 2);
}

/** Open an encrypted club data file (from this app or the desktop app). */
export async function importEncrypted(text: string, passphrase: string): Promise<ClubData> {
  let salt: Uint8Array;
  let iv: Uint8Array;
  let sealed: Uint8Array;
  let iterations: number;
  try {
    const outer = JSON.parse(text.replace(/^﻿/, ''));
    if (outer.format !== FORMAT) throw new Error();
    salt = unb64(outer.salt);
    iv = unb64(outer.iv);
    sealed = unb64(outer.data);
    iterations = Number(outer.iterations) || ITERATIONS;
  } catch {
    throw new ClubDataError('This is not a club data file from this app.');
  }
  try {
    const key = await deriveKey(passphrase, salt, iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(FORMAT) }, key, sealed);
    const inner = JSON.parse(new TextDecoder().decode(plain));
    return { left_players: clean_marks(inner.left_players), coach_notes: clean_notes(inner.coach_notes),
      paid_outside: clean_paid_marks(inner.paid_outside) };
  } catch {
    throw new ClubDataError('Wrong passphrase, or the file is damaged.');
  }
}
