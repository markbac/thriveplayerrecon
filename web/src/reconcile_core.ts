/**
 * Core logic for reconciling an FA player registration report with a Thrive export.
 * Ported from src/reconcile_core.py for 100% parity in the client-side web app.
 */

export const APP_NAME = 'PlayerReconcile';
export const APP_TITLE = 'Player Reconciliation';
export const VERSION = '1.6.0';
export const BUILD_DATETIME = '12/11/2026 15:56';

export const IGNORE = null; // mapping value meaning "this Thrive team has no FA equivalent"
export const NO_FA = 'No FA needed';

export const CLUB = 'Wilpshire Wanderers ';

export const DEFAULT_TEAM_MAP: Record<string, string | null> = {
  'U07 Eagles': CLUB + 'U7 Eagles',
  'U07 Falcons': CLUB + 'U7 Falcons',
  'U08 Black': CLUB + 'U8 Black',
  'U08 Blue': CLUB + 'U8 Blue',
  'U08 Red': CLUB + 'U8 Red',
  'U08 White': CLUB + 'U8 White',
  'U09 Black': CLUB + 'U9 Black',
  'U09 Red': CLUB + 'U9 Red',
  'U09 White': CLUB + 'U9 White',
  'U10 Black': CLUB + 'U10 Black',
  'U10 Blue': CLUB + 'U10 Blue',
  'U10 Green': CLUB + 'U10 Green',
  'U10 White': CLUB + 'U10 White',
  'U11 Black': CLUB + 'U11 Black',
  'U11 White': CLUB + 'U11 White',
  'U12 Black': CLUB + 'U12 Black',
  'U12 Red': CLUB + 'U12 Red',
  'U13 Blue': CLUB + 'U13 Blue',
  'U15 Blue': CLUB + 'U15 Blue',
  'U16 Blue': CLUB + 'U16 Blue',
  'U16 Red': CLUB + 'U16 Red',
  'U18 Black': CLUB + 'U18 Black',
  // Thrive-only groups with no FA registration: still checked for a mandate, not for the FA
  'U04': IGNORE,
  'U05': IGNORE,
  'U06': IGNORE,
  'U7-8 Training': IGNORE,
  'U9-10 Training': IGNORE,
};

export const NICKNAMES: Record<string, string> = {
  teddy: 'edward',
  ted: 'edward',
  eddie: 'edward',
  jake: 'jacob',
  charlie: 'charles',
  alfie: 'alfred',
  bobby: 'robert',
  jimmy: 'james',
  tommy: 'thomas',
  billy: 'william',
  will: 'william',
  harry: 'henry',
};

export const FA_REQUIRED = [
  'first names',
  'surname',
  'fan id',
  'date of birth',
  'team',
  'registration status',
];

export const THRIVE_REQUIRED = ['last name', 'first name', 'date of birth', 'teams'];

export const ADULT_AGE = 19;
export const DEFAULT_FUZZY = 0.8;

export const THRIVE_FIELDS: Record<string, string[]> = {
  account_owner: ['account owner'],
  owner_phone: ['owner phone'],
  pg_name: ['parents/guardian name'],
  pg_email: ['parents/guardian email'],
  pg_dob: ['parents/guardian date of birth'],
  photo: ['wwfc photography policy', 'photography'],
  conduct: ['wwfc code of conduct', 'code of conduct'],
  club_rules: ['club rules'],
  has_medical: ['has medical conditions'],
  conditions: ['medical conditions'],
  allergies: ['allergies'],
  medicines: ['medicines'],
  behavioural: ['behavioural conditions'],
  disabilities: ['disabilities'],
  other: ['other conditions'],
  doctor: ['doctor name'],
  doctor_phone: ['doctors phone', 'doctor phone'],
  surgery: ['surgery address'],
  notes: ['medical notes'],
};

export const MANDATE_HEADER = 'active mandates';
export const MANDATE_UNKNOWN = 'Unknown';

export const THRIVE_REQUIRED_ITEMS: Record<string, string> = {
  'first name': 'Name',
  'last name': 'Name',
  'date of birth': 'Date of birth',
  teams: 'Teams',
};

export const THRIVE_OPTIONAL_ITEMS: Array<[string, string[], string]> = [
  [
    'Active pre-authorisation',
    ['_mandate'],
    'who is paying: the Paying column and the Not paying list',
  ],
  [
    'Account owner',
    ['account_owner'],
    'the main contact on team sheets and WhatsApp messages',
  ],
  ['Owner phone', ['owner_phone'], 'contact phone numbers and Copy for WhatsApp'],
  [
    'Parents/guardian name, required for fa registration',
    ['pg_name'],
    'parent contact details',
  ],
  [
    'Parents/guardian email address for fa registration',
    ['pg_email'],
    'parent email addresses',
  ],
  [
    'Parents/guardian date of birth required for fa registration',
    ['pg_dob'],
    'parent details on team sheets',
  ],
  [
    'Medical',
    [
      'has_medical',
      'conditions',
      'allergies',
      'medicines',
      'behavioural',
      'disabilities',
      'other',
      'doctor',
      'doctor_phone',
      'surgery',
    ],
    'medical information on team sheets and messages',
  ],
  ['Medical notes', ['notes'], 'medical notes'],
  ['Wwfc photography policy', ['photo'], 'photography consent'],
  ['Wwfc code of conduct - youth players', ['conduct'], 'code of conduct'],
  ['Club rules', ['club_rules'], 'club rules'],
];

export const THRIVE_ALL_ITEMS: string[] = [
  'Name',
  'Date of birth',
  'Teams',
  ...THRIVE_OPTIONAL_ITEMS.map(([item]) => item),
];

export const THRIVE_HOW_TO =
  'To get the Thrive export: log in to Thrive, go to Contacts and select the products you are ' +
  'interested in. In Manage table columns add: ' +
  THRIVE_ALL_ITEMS.join(', ') +
  '. Then click Export. Some items, such as Medical, add several columns to the export.';

export const FA_HOW_TO =
  'To get the FA export: go to the club portal (https://clubs.thefa.com/), select Players, then ' +
  'Export > Player information. Wait for the export to be created, then go to My club > Documents to ' +
  'download it. It can take a few minutes to appear.';

export const FA_FIELDS: Record<string, string[]> = {
  email: ['email address'],
  parent_email: ['parent/carer email address'],
  parent_name: ['parent/carer name'],
  emergency: ['emergency contact'],
  emergency_phone: ['emergency contact ph'],
  consent: ['consent given'],
  other_clubs: ['other clubs'],
};

export type Level = 'ok' | 'warn' | 'bad' | 'info';

export const LEVELS: Record<string, Level> = {
  Matched: 'ok',
  'Matched (data quality)': 'warn',
  'Matched (team differs)': 'warn',
  'Check match': 'warn',
  'Thrive only': 'bad',
  'FA only': 'bad',
  'Thrive only (expected)': 'info',
  'FA only (not registered)': 'info',
};

const LEVEL_ORDER: Record<Level, number> = { bad: 0, warn: 1, info: 2, ok: 3 };

export class ReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

// --------------------------------------------------------------------------- Simple Date (YYYY-MM-DD)

export interface LocalDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

export function makeDate(year: number, month: number, day: number): LocalDate {
  return { year, month, day };
}

export function todayLocalDate(): LocalDate {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

export function dateEquals(a: LocalDate | null, b: LocalDate | null): boolean {
  if (!a || !b) return a === b;
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function formatDate(d: LocalDate | null): string {
  if (!d) return 'none';
  const dd = String(d.day).padStart(2, '0');
  const mm = String(d.month).padStart(2, '0');
  const yyyy = String(d.year).padStart(4, '0');
  return `${dd}/${mm}/${yyyy}`;
}

export function cellDateOrStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (isLocalDate(v)) return formatDate(v);
  return String(v);
}

export function isLocalDate(v: unknown): v is LocalDate {
  return (
    typeof v === 'object' &&
    v !== null &&
    'year' in v &&
    'month' in v &&
    'day' in v &&
    typeof (v as LocalDate).year === 'number'
  );
}

// --------------------------------------------------------------------------- data types

export class FAPlayer {
  fan_id: string;
  first: string;
  last: string;
  dob: LocalDate | null;
  suspended: boolean;
  teams: Record<string, string>; // insertion order preserved in JS for string keys
  parents: string[];
  fields: Record<string, string>;

  constructor(
    fan_id: string,
    first: string,
    last: string,
    dob: LocalDate | null,
    suspended = false,
    teams: Record<string, string> = {},
    parents: string[] = [],
    fields: Record<string, string> = {}
  ) {
    this.fan_id = fan_id;
    this.first = first;
    this.last = last;
    this.dob = dob;
    this.suspended = suspended;
    this.teams = teams;
    this.parents = parents;
    this.fields = fields;
  }

  registered_teams(): string[] {
    return Object.entries(this.teams)
      .filter(([, s]) => s.toLowerCase() === 'registered')
      .map(([t]) => t);
  }
}

export class ThrivePlayer {
  first: string;
  last: string;
  dob: LocalDate | null;
  mandate: string;
  teams: string[];
  fields: Record<string, string>;

  constructor(
    first: string,
    last: string,
    dob: LocalDate | null,
    mandate = '',
    teams: string[] = [],
    fields: Record<string, string> = {}
  ) {
    this.first = first;
    this.last = last;
    this.dob = dob;
    this.mandate = mandate;
    this.teams = teams;
    this.fields = fields;
  }
}

export class Staff {
  name: string;
  role: string;
  teams: string[];
  phone: string;
  email: string;

  constructor(name: string, role = 'Manager', teams: string[] = [], phone = '', email = '') {
    this.name = name;
    this.role = role;
    this.teams = teams;
    this.phone = phone;
    this.email = email;
  }

  get kind(): 'assistant' | 'manager' | 'other' {
    const r = this.role.toLowerCase();
    if (['assist', 'asst', 'deputy'].some((w) => r.includes(w))) {
      return 'assistant';
    }
    return !r || r.includes('manager') || r.includes('head coach') ? 'manager' : 'other';
  }
}

export class Row {
  result: string;
  confidence: string;
  issue: string;
  dq: string;
  fan_id: string;
  fa_name: string;
  thrive_name: string;
  fa_dob: LocalDate | null;
  thrive_dob: LocalDate | null;
  fa_teams: string;
  thrive_teams: string;
  expected_fa_teams: string;
  fa_status: string;
  mandate: string;
  fa: FAPlayer | null;
  th: ThrivePlayer | null;

  constructor(
    result: string,
    confidence: string,
    issue: string,
    dq: string,
    fan_id: string,
    fa_name: string,
    thrive_name: string,
    fa_dob: LocalDate | null,
    thrive_dob: LocalDate | null,
    fa_teams: string,
    thrive_teams: string,
    expected_fa_teams: string,
    fa_status: string,
    mandate: string,
    fa: FAPlayer | null = null,
    th: ThrivePlayer | null = null
  ) {
    this.result = result;
    this.confidence = confidence;
    this.issue = issue;
    this.dq = dq;
    this.fan_id = fan_id;
    this.fa_name = fa_name;
    this.thrive_name = thrive_name;
    this.fa_dob = fa_dob;
    this.thrive_dob = thrive_dob;
    this.fa_teams = fa_teams;
    this.thrive_teams = thrive_teams;
    this.expected_fa_teams = expected_fa_teams;
    this.fa_status = fa_status;
    this.mandate = mandate;
    this.fa = fa;
    this.th = th;
  }

  get level(): Level {
    return LEVELS[this.result];
  }
}

export class Result {
  rows: Row[];
  club_prefix: string;
  teams: Record<string, Array<[string, Row]>>;
  staff: Record<string, Staff[]>;
  staff_issues: string[];

  constructor(
    rows: Row[],
    club_prefix: string,
    teams: Record<string, Array<[string, Row]>> = {},
    staff: Record<string, Staff[]> = {},
    staff_issues: string[] = []
  ) {
    this.rows = rows;
    this.club_prefix = club_prefix;
    this.teams = teams;
    this.staff = staff;
    this.staff_issues = staff_issues;
  }

  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.rows) {
      out[r.result] = (out[r.result] || 0) + 1;
    }
    return out;
  }
}

// --------------------------------------------------------------------------- reading helpers

export function _hdr(value: unknown): string {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function _s(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isInteger(value)) {
    return String(Math.trunc(value));
  }
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2200) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function _to_date(value: unknown): LocalDate | null {
  if (value === null || value === undefined) return null;
  if (isLocalDate(value)) return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // ExcelJS dates are UTC timestamps for date cells
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }
  const text = _s(value);
  if (!text) return null;

  // Match %d/%m/%Y or %d/%m/%Y %H:%M
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2})?$/.exec(text);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (isValidCalendarDate(year, month, day)) return { year, month, day };
    return null;
  }

  // Match %Y-%m-%d or %Y-%m-%d %H:%M:%S
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+\d{1,2}:\d{2}:\d{2})?$/.exec(text);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (isValidCalendarDate(year, month, day)) return { year, month, day };
    return null;
  }

  return null;
}

export function _find_col(cols: Record<string, number>, candidates: string[]): number | null {
  const tests: Array<(h: string, c: string) => boolean> = [
    (h, c) => h === c,
    (h, c) => h.startsWith(c),
    (h, c) => h.includes(c),
  ];
  for (const test of tests) {
    for (const cand of candidates) {
      for (const [header, idx] of Object.entries(cols)) {
        if (test(header, cand)) return idx;
      }
    }
  }
  return null;
}

export function _field_cols(
  cols: Record<string, number>,
  spec: Record<string, string[]>
): Record<string, number> {
  const found: Record<string, number> = {};
  for (const [name, cands] of Object.entries(spec)) {
    const idx = _find_col(cols, cands);
    if (idx !== null) {
      found[name] = idx;
    }
  }
  return found;
}

export function _dedupe_csv(text: string): string {
  const seen: string[] = [];
  for (const raw of text.split(',')) {
    const part = raw.trim();
    if (part && !seen.includes(part)) {
      seen.push(part);
    }
  }
  return seen.join(', ');
}

export function _cell(row: unknown[], idx: number | null | undefined): string {
  if (idx === null || idx === undefined || idx >= row.length) return '';
  const v = row[idx];
  if (v instanceof Date || isLocalDate(v)) {
    const d = _to_date(v);
    return d ? formatDate(d) : '';
  }
  return _s(v);
}

export function extractTableFromSheets(
  sheets: unknown[][][],
  fileName: string,
  required: string[],
  what: string,
  labels?: Record<string, string>,
  how_to = ''
): { rows: unknown[][]; cols: Record<string, number> } {
  let best: string[] = [];
  for (const rows of sheets) {
    const limit = Math.min(rows.length, 40);
    for (let i = 0; i < limit; i++) {
      const row = rows[i] || [];
      const cells = row.map((c) => _hdr(c));
      const present = required.filter((h) => cells.includes(h));
      if (present.length === required.length) {
        const cols: Record<string, number> = {};
        cells.forEach((h, j) => {
          if (h) cols[h] = j;
        });
        return { rows: rows.slice(i + 1), cols };
      }
      if (present.length > best.length) {
        best = present;
      }
    }
  }
  const base = fileName.split(/[\\/]/).pop() || fileName;
  if (best.length >= Math.max(2, Math.floor(required.length / 2))) {
    const lbls = labels || {};
    const missing: string[] = [];
    for (const h of required) {
      const mapped = lbls[h] ?? h;
      if (!best.includes(h) && !missing.includes(mapped)) {
        missing.push(mapped);
      }
    }
    throw new ReportError(
      `${base} looks like the ${what}, but it is missing: ${missing.join(', ')}.\n\n` +
        (how_to || 'Export it again with these columns.')
    );
  }
  throw new ReportError(
    `${base} does not look like the ${what}. Expected columns: ${required.join(', ')}.` +
      (how_to ? `\n\n${how_to}` : '')
  );
}

export function detectKindFromSheets(sheets: unknown[][][]): 'fa' | 'thrive' | null {
  for (const rows of sheets) {
    const limit = Math.min(rows.length, 40);
    for (let i = 0; i < limit; i++) {
      const cells = (rows[i] || []).map((c) => _hdr(c));
      if (FA_REQUIRED.every((h) => cells.includes(h))) return 'fa';
      if (THRIVE_REQUIRED.every((h) => cells.includes(h))) return 'thrive';
    }
  }
  return null;
}

export function loadFaFromSheets(sheets: unknown[][][], fileName = 'fa.xlsx'): FAPlayer[] {
  const { rows, cols: c } = extractTableFromSheets(
    sheets,
    fileName,
    FA_REQUIRED,
    'FA player registration report',
    undefined,
    FA_HOW_TO
  );
  const suspended_col = c['suspended'];
  const parent_col = c['parent/carer name'];
  const fa_cols = _field_cols(c, FA_FIELDS);
  const players = new Map<string, FAPlayer>();

  for (const r of rows) {
    const first = _s(r[c['first names']]);
    const last = _s(r[c['surname']]);
    if (!first && !last) continue;
    const dob = _to_date(r[c['date of birth']]);
    const fan = _s(r[c['fan id']]);
    const key = fan
      ? `fan:${fan}`
      : `name:${squash(first)}:${squash(last)}:${dob ? formatDate(dob) : 'none'}`;
    let p = players.get(key);
    if (!p) {
      p = new FAPlayer(fan, first, last, dob);
      players.set(key, p);
    }
    const team = _s(r[c['team']]);
    const status = _s(r[c['registration status']]);
    if (team && (!(team in p.teams) || status.toLowerCase() === 'registered')) {
      p.teams[team] = status;
    }
    for (const [name, idx] of Object.entries(fa_cols)) {
      const value = _cell(r, idx);
      if (value && !p.fields[name]) {
        p.fields[name] = value;
      }
    }
    if (parent_col !== undefined) {
      for (const rawName of _s(r[parent_col]).split(',')) {
        const trimmed = rawName.trim();
        if (trimmed && !p.parents.includes(trimmed)) {
          p.parents.push(trimmed);
        }
      }
    }
    if (
      suspended_col !== undefined &&
      ['true', 'yes', 'y'].includes(_s(r[suspended_col]).toLowerCase())
    ) {
      p.suspended = true;
    }
  }
  return Array.from(players.values());
}

export function missing_thrive_items(cols: Record<string, number>): Array<[string, string]> {
  const found = new Set(Object.keys(_field_cols(cols, THRIVE_FIELDS)));
  if (MANDATE_HEADER in cols) {
    found.add('_mandate');
  }
  return THRIVE_OPTIONAL_ITEMS.filter(([, keys]) => !keys.some((k) => found.has(k))).map(
    ([item, , use]) => [item, use]
  );
}

export function loadThriveFromSheets(
  sheets: unknown[][][],
  fileName = 'thrive.xlsx',
  missing?: Array<[string, string]>
): ThrivePlayer[] {
  const { rows, cols: c } = extractTableFromSheets(
    sheets,
    fileName,
    THRIVE_REQUIRED,
    'Thrive data export',
    THRIVE_REQUIRED_ITEMS,
    THRIVE_HOW_TO
  );
  if (missing) {
    missing.push(...missing_thrive_items(c));
  }
  const mandate_col = c[MANDATE_HEADER];
  const th_cols = _field_cols(c, THRIVE_FIELDS);
  const players: ThrivePlayer[] = [];

  for (const r of rows) {
    const first = _s(r[c['first name']]);
    const last = _s(r[c['last name']]);
    if (!first && !last) continue;
    const teams: string[] = [];
    for (const rawTeam of _s(r[c['teams']]).split(',')) {
      const t = rawTeam.trim();
      if (t && !teams.some((x) => x.toLowerCase() === t.toLowerCase())) {
        teams.push(t);
      }
    }
    const extra: Record<string, string> = {};
    for (const [name, idx] of Object.entries(th_cols)) {
      extra[name] = _cell(r, idx);
    }
    if (extra.owner_phone) {
      extra.owner_phone = _dedupe_csv(extra.owner_phone);
    }
    players.push(
      new ThrivePlayer(
        first,
        last,
        _to_date(r[c['date of birth']]),
        mandate_col !== undefined ? _s(r[mandate_col]) : MANDATE_UNKNOWN,
        teams,
        extra
      )
    );
  }
  return players;
}

// --------------------------------------------------------------------------- name matching & SequenceMatcher

export function _fold(text: string): string {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function squash(text: string): string {
  return _fold(text).replace(/[^a-z0-9]/g, '');
}

/**
 * Exact port of Python's difflib.SequenceMatcher(None, a, b).ratio()
 * for plain ASCII strings (no junk heuristic).
 */
export function sequenceMatcherRatio(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0 && lb === 0) return 1.0;
  if (la === 0 || lb === 0) return 0.0;

  // Build b2j index mapping each character in b to its indices
  const b2j = new Map<string, number[]>();
  for (let j = 0; j < lb; j++) {
    const ch = b[j];
    let list = b2j.get(ch);
    if (!list) {
      list = [];
      b2j.set(ch, list);
    }
    list.push(j);
  }

  function findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): [number, number, number] {
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();

    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>();
      const indices = b2j.get(a[i]);
      if (indices) {
        for (const j of indices) {
          if (j < blo) continue;
          if (j >= bhi) break;
          const k = (j2len.get(j - 1) || 0) + 1;
          newj2len.set(j, k);
          if (k > bestsize) {
            besti = i - k + 1;
            bestj = j - k + 1;
            bestsize = k;
          }
        }
      }
      j2len = newj2len;
    }
    return [besti, bestj, bestsize];
  }

  const queue: Array<[number, number, number, number]> = [[0, la, 0, lb]];
  const matchingBlocks: Array<[number, number, number]> = [];
  while (queue.length > 0) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = findLongestMatch(alo, ahi, blo, bhi);
    if (k > 0) {
      matchingBlocks.push([i, j, k]);
      if (alo < i && blo < j) {
        queue.push([alo, i, blo, j]);
      }
      if (i + k < ahi && j + k < bhi) {
        queue.push([i + k, ahi, j + k, bhi]);
      }
    }
  }

  let matches = 0;
  for (const [, , k] of matchingBlocks) {
    matches += k;
  }
  return (2.0 * matches) / (la + lb);
}

/**
 * Python round(val, 3) uses round-half-to-even, though for ratio * 0.9 standard 3-decimal rounding matches.
 */
function pythonRound3(val: number): number {
  const scaled = val * 1000;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  if (Math.abs(diff - 0.5) < 1e-9) {
    return (floor % 2 === 0 ? floor : floor + 1) / 1000;
  }
  return Math.round(scaled) / 1000;
}

export function _name_score(a: string, b: string, allow_suffix: boolean, fuzzy = DEFAULT_FUZZY): number {
  const sa = squash(a);
  const sb = squash(b);
  if (!sa || !sb) return 0.0;
  if (sa === sb) return 1.0;
  const [short, long_] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  if (short.length >= 3 && long_.startsWith(short)) return 0.92;
  if (allow_suffix && short.length >= 4 && long_.endsWith(short)) return 0.9;
  if ((NICKNAMES[sa] ?? sa) === (NICKNAMES[sb] ?? sb)) return 0.9;
  const ratio = sequenceMatcherRatio(sa, sb);
  return ratio >= fuzzy ? pythonRound3(ratio * 0.9) : 0.0;
}

export function _dob_score(a: LocalDate | null, b: LocalDate | null): number {
  if (a === null || b === null) return 0.2;
  if (dateEquals(a, b)) return 1.0;
  const same =
    (a.day === b.day ? 1 : 0) + (a.month === b.month ? 1 : 0) + (a.year === b.year ? 1 : 0);
  const swapped = a.year === b.year && a.day === b.month && a.month === b.day;
  return same === 2 || swapped ? 0.6 : 0.2;
}

export type PairEntry = [number, number, number, number, boolean]; // [fa_idx, fs, ls, ds, swapped]

export function _pair_up(
  thrive: ThrivePlayer[],
  fa: FAPlayer[],
  fuzzy = DEFAULT_FUZZY
): Map<number, PairEntry> {
  type Cand = [number, number, number, number, number, number, boolean];
  const cands: Cand[] = [];
  for (let ti = 0; ti < thrive.length; ti++) {
    const t = thrive[ti];
    for (let fi = 0; fi < fa.length; fi++) {
      const f = fa[fi];
      let fs = _name_score(t.first, f.first, false, fuzzy);
      let ls = fs ? _name_score(t.last, f.last, true, fuzzy) : 0.0;
      let swapped = false;
      if (!(fs && ls)) {
        const fs2 = _name_score(t.first, f.last, true, fuzzy);
        const ls2 = fs2 ? _name_score(t.last, f.first, false, fuzzy) : 0.0;
        if (fs2 && ls2) {
          fs = fs2 * 0.9;
          ls = ls2 * 0.9;
          swapped = true;
        } else {
          continue;
        }
      }
      const ds = _dob_score(t.dob, f.dob);
      cands.push([-(0.35 * fs + 0.35 * ls + 0.3 * ds), ti, fi, fs, ls, ds, swapped]);
    }
  }
  // Lexicographic tuple sort matching Python's cands.sort()
  cands.sort((a, b) => {
    for (let k = 0; k < 6; k++) {
      if (a[k] !== b[k]) return (a[k] as number) - (b[k] as number);
    }
    return (a[6] ? 1 : 0) - (b[6] ? 1 : 0);
  });

  const pairs = new Map<number, PairEntry>();
  const used_fa = new Set<number>();
  for (const [, ti, fi, fs, ls, ds, swapped] of cands) {
    if (!pairs.has(ti) && !used_fa.has(fi)) {
      pairs.set(ti, [fi, fs, ls, ds, swapped]);
      used_fa.add(fi);
    }
  }
  return pairs;
}

// --------------------------------------------------------------------------- data quality

export function _age_on(dob: LocalDate, ref: LocalDate): number {
  const beforeBirthday =
    ref.month < dob.month || (ref.month === dob.month && ref.day < dob.day) ? 1 : 0;
  return ref.year - dob.year - beforeBirthday;
}

export function _season_ref(today: LocalDate): LocalDate {
  return {
    year: today.month >= 9 ? today.year : today.year - 1,
    month: 8,
    day: 31,
  };
}

export function _team_age_limit(team: string): number | null {
  const m = /\bu0*(\d+)\b/i.exec(team);
  return m ? Number(m[1]) : null;
}

export function _bad_case(word: string): boolean {
  const letters = Array.from(word).filter((ch) => /\p{L}/u.test(ch));
  return (
    (letters.length > 1 && (word === word.toLowerCase() || word === word.toUpperCase())) ||
    (letters.length > 0 && word[0] !== word[0].toUpperCase() && word[0] === word[0].toLowerCase())
  );
}

export function _case_issue(first: string, last: string): boolean {
  return _bad_case(first) || _bad_case(last);
}

export function _parent_index(fa: FAPlayer[]): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const f of fa) {
    for (const full of f.parents) {
      const parts = full.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        out.push([parts[0], parts[parts.length - 1], `${f.first} ${f.last}`]);
      }
    }
  }
  return out;
}

export function _matches_parent(
  first: string,
  last: string,
  parents: Array<[string, string, string]>,
  fuzzy: number
): string | null {
  for (const [pf, pl, child] of parents) {
    if (
      _name_score(first, pf, false, fuzzy) >= 0.9 &&
      _name_score(last, pl, false, fuzzy) >= 0.9
    ) {
      return child;
    }
  }
  return null;
}

// --------------------------------------------------------------------------- team mapping

export function _tkey(name: string): string {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function club_prefix(fa_teams: Iterable<string>): string {
  const list = Array.from(fa_teams);
  const split = list.map((t) => t.trim().split(/\s+/).filter(Boolean));
  if (split.length === 0) return '';
  const minLen = Math.min(...split.map((s) => s.length));
  const words: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const group = split.map((s) => s[i]);
    const unique = new Set(group);
    if (unique.size !== 1 || /^u\d+$/i.test(group[0])) {
      break;
    }
    words.push(group[0]);
  }
  return words.join(' ');
}

export function _team_form(name: string, prefix: string): string {
  const text0 = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
  const text1 = _fold(text0).replace(/\bu0*(\d+)/g, 'u$1');
  const matches = text1.match(/[a-z0-9-]+/g);
  return matches ? matches.join(' ') : '';
}

export function suggest_mapping(
  thrive_teams: Iterable<string>,
  fa_teams: Iterable<string>
): Record<string, string | null> {
  const faList = Array.from(fa_teams);
  const prefix = club_prefix(faList);
  const by_form: Record<string, string> = {};
  for (const t of faList) {
    by_form[_team_form(t, prefix)] = t;
  }
  const out: Record<string, string | null> = {};
  for (const t of thrive_teams) {
    const form = _team_form(t, '');
    if (form in by_form) {
      out[t] = by_form[form];
    } else if (form.includes('training') || /^u\d+$/.test(form)) {
      out[t] = IGNORE;
    }
  }
  return out;
}

// --------------------------------------------------------------------------- reconcile

function lastWordLower(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1].toLowerCase() : '';
}

export function reconcile(
  fa: FAPlayer[],
  thrive: ThrivePlayer[],
  team_map: Record<string, string | null>,
  fuzzy = DEFAULT_FUZZY,
  today?: LocalDate
): Result {
  const todayDate = today ?? todayLocalDate();
  const season_ref = _season_ref(todayDate);
  const lookup = new Map<string, string | null>();
  for (const [k, v] of Object.entries(team_map)) {
    lookup.set(_tkey(k), v);
  }
  const allFaTeams = new Set<string>();
  for (const p of fa) {
    for (const t of Object.keys(p.teams)) {
      allFaTeams.add(t);
    }
  }
  const prefix = club_prefix(allFaTeams);
  const parents = _parent_index(fa);

  function short(team: string): string {
    return prefix && team.startsWith(prefix) ? team.slice(prefix.length).trim() : team;
  }

  function expected_for(t: ThrivePlayer): [string[], string[]] {
    const expected: string[] = [];
    const unmapped: string[] = [];
    for (const name of t.teams) {
      const k = _tkey(name);
      if (!lookup.has(k)) {
        unmapped.push(name);
      } else {
        const mapped = lookup.get(k)!;
        if (mapped !== IGNORE && !expected.includes(mapped)) {
          expected.push(mapped);
        }
      }
    }
    return [expected, unmapped];
  }

  function age_flags(dob: LocalDate | null, teams: string[], source: string): string[] {
    const out: string[] = [];
    if (!dob) return out;
    const age = _age_on(dob, season_ref);
    for (const team of teams) {
      const limit = _team_age_limit(team);
      if (limit !== null && age >= limit) {
        out.push(
          `${source} DOB gives age ${age} at ${formatDate(season_ref)}, too old for ${short(team)}`
        );
      }
    }
    return out;
  }

  function thrive_flags(t: ThrivePlayer): string[] {
    const out: string[] = [];
    if (!t.dob) {
      out.push('Thrive has no date of birth');
    } else if (_age_on(t.dob, todayDate) >= ADULT_AGE) {
      out.push(
        `Thrive DOB gives age ${_age_on(t.dob, todayDate)}: parent/carer details entered instead of the player's?`
      );
    }
    const child = _matches_parent(t.first, t.last, parents, fuzzy);
    if (child) {
      out.push(`Thrive name matches an FA parent/carer of ${child}`);
    }
    if (_case_issue(t.first, t.last)) {
      out.push(`Thrive name capitalisation: '${t.first} ${t.last}'`);
    }
    return out;
  }

  const pairs = _pair_up(thrive, fa, fuzzy);
  const rows: Row[] = [];

  const dup_notes = new Map<number, string>();
  for (let i = 0; i < thrive.length; i++) {
    for (let j = i + 1; j < thrive.length; j++) {
      const a_ = thrive[i];
      const b_ = thrive[j];
      if (
        a_.dob &&
        dateEquals(a_.dob, b_.dob) &&
        _name_score(a_.first, b_.first, false, fuzzy) > 0 &&
        _name_score(a_.last, b_.last, true, fuzzy) > 0
      ) {
        dup_notes.set(i, `Possible duplicate Thrive record: ${b_.first} ${b_.last}`);
        dup_notes.set(j, `Possible duplicate Thrive record: ${a_.first} ${a_.last}`);
      }
    }
  }

  for (let ti = 0; ti < thrive.length; ti++) {
    const t = thrive[ti];
    const [expected, unmapped] = expected_for(t);
    const dq = thrive_flags(t);
    if (dup_notes.has(ti)) {
      dq.push(dup_notes.get(ti)!);
    }
    const pair = pairs.get(ti);
    if (pair) {
      const [fi, fs, ls, ds, swapped] = pair;
      const f = fa[fi];
      const active = f.registered_teams();
      const issues: string[] = [];
      if (swapped) {
        issues.push(
          `Name: first/last swapped, FA '${f.first} ${f.last}' vs Thrive '${t.first} ${t.last}'`
        );
      } else if (fs < 1 || ls < 1) {
        issues.push(`Name: FA '${f.first} ${f.last}' vs Thrive '${t.first} ${t.last}'`);
      }
      if (ds < 1) {
        issues.push(`DOB: FA ${formatDate(f.dob)} vs Thrive ${formatDate(t.dob)}`);
      }
      const confidence =
        issues.length === 0
          ? 'Exact'
          : ds === 1
            ? 'Name differs'
            : fs === 1 && ls === 1
              ? 'DOB differs'
              : 'Name and DOB differ';
      const team_issues: string[] = [];
      for (const team of expected) {
        if (!active.includes(team)) {
          team_issues.push(`Thrive team ${short(team)} but not registered in FA`);
        }
      }
      for (const team of active) {
        if (!expected.includes(team)) {
          team_issues.push(`FA team ${short(team)} but not in Thrive`);
        }
      }
      if (unmapped.length > 0) {
        team_issues.push('Unmapped Thrive team: ' + unmapped.join(', '));
      }
      if (active.length === 0) {
        const states = Array.from(new Set(Object.values(f.teams))).sort().join(', ') || 'none';
        team_issues.push(`No active FA registration (status: ${states})`);
      }
      if (f.suspended) {
        team_issues.push('Suspended in FA');
      }
      dq.push(...age_flags(f.dob ?? t.dob, active, f.dob ? 'FA' : 'Thrive'));
      if (_case_issue(f.first, f.last)) {
        dq.push(`FA name capitalisation: '${f.first} ${f.last}'`);
      }
      const result =
        issues.length > 0
          ? 'Check match'
          : team_issues.length > 0
            ? 'Matched (team differs)'
            : dq.length > 0
              ? 'Matched (data quality)'
              : 'Matched';
      rows.push(
        new Row(
          result,
          confidence,
          [...issues, ...team_issues].join('; '),
          dq.join('; '),
          f.fan_id,
          `${f.first} ${f.last}`,
          `${t.first} ${t.last}`,
          f.dob,
          t.dob,
          active.map((x) => short(x)).join(', '),
          t.teams.join(', '),
          expected.map((x) => short(x)).join(', '),
          Array.from(new Set(Object.values(f.teams))).sort().join(', '),
          t.mandate,
          f,
          t
        )
      );
    } else {
      dq.push(...age_flags(t.dob, expected, 'Thrive'));
      let result: string;
      let issue: string;
      if (unmapped.length > 0) {
        result = 'Thrive only';
        issue = 'Not found in FA. Unmapped Thrive team: ' + unmapped.join(', ');
      } else if (expected.length > 0) {
        result = 'Thrive only';
        issue = 'Not found in FA report';
      } else if (t.teams.length > 0) {
        result = 'Thrive only (expected)';
        issue = 'Only in teams with no FA equivalent';
      } else {
        result = 'Thrive only';
        issue = 'Not found in FA and has no team in Thrive';
      }
      rows.push(
        new Row(
          result,
          '',
          issue,
          dq.join('; '),
          '',
          '',
          `${t.first} ${t.last}`,
          null,
          t.dob,
          '',
          t.teams.join(', '),
          expected.map((x) => short(x)).join(', '),
          '',
          t.mandate,
          null,
          t
        )
      );
    }
  }

  const matched_fa = new Set<number>();
  for (const [fi] of pairs.values()) {
    matched_fa.add(fi);
  }
  const fa_dups = new Map<number, string>();
  for (let i = 0; i < fa.length; i++) {
    for (let j = i + 1; j < fa.length; j++) {
      const a_ = fa[i];
      const b_ = fa[j];
      if (
        a_.dob &&
        dateEquals(a_.dob, b_.dob) &&
        _name_score(a_.first, b_.first, false, fuzzy) > 0 &&
        _name_score(a_.last, b_.last, true, fuzzy) > 0
      ) {
        fa_dups.set(i, `Possible duplicate FA record (FAN ID ${b_.fan_id})`);
        fa_dups.set(j, `Possible duplicate FA record (FAN ID ${a_.fan_id})`);
      }
    }
  }

  for (let fi = 0; fi < fa.length; fi++) {
    if (matched_fa.has(fi)) continue;
    const f = fa[fi];
    const active = f.registered_teams();
    const states = Array.from(new Set(Object.values(f.teams))).sort().join(', ');
    const dq = age_flags(f.dob, active, 'FA');
    if (_case_issue(f.first, f.last)) {
      dq.push(`FA name capitalisation: '${f.first} ${f.last}'`);
    }
    if (fa_dups.has(fi)) {
      dq.push(fa_dups.get(fi)!);
    }
    const [result, issue] =
      active.length > 0
        ? ['FA only', 'Registered in FA but not found in Thrive']
        : ['FA only (not registered)', `FA status ${states}, so not expected in Thrive`];
    rows.push(
      new Row(
        result,
        '',
        issue,
        dq.join('; '),
        f.fan_id,
        `${f.first} ${f.last}`,
        '',
        f.dob,
        null,
        active.map((x) => short(x)).join(', '),
        '',
        '',
        states,
        '',
        f,
        null
      )
    );
  }

  for (const [fi, note] of fa_dups.entries()) {
    if (matched_fa.has(fi)) {
      for (const row of rows) {
        if (row.fan_id === fa[fi].fan_id && row.fa_name) {
          row.dq = [row.dq, note].filter(Boolean).join('; ');
          if (row.result === 'Matched') {
            row.result = 'Matched (data quality)';
          }
        }
      }
    }
  }

  rows.sort((a, b) => {
    const la = LEVEL_ORDER[a.level];
    const lb = LEVEL_ORDER[b.level];
    if (la !== lb) return la - lb;
    if (a.result !== b.result) return a.result < b.result ? -1 : 1;
    const sa = lastWordLower(a.fa_name || a.thrive_name);
    const sb = lastWordLower(b.fa_name || b.thrive_name);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  const teams: Record<string, Array<[string, Row]>> = {};
  for (const row of rows) {
    const active = row.fa ? row.fa.registered_teams() : [];
    const expected = row.th ? expected_for(row.th)[0] : [];
    const combined = [...active, ...expected.filter((x) => !active.includes(x))];
    for (const team of combined) {
      const source =
        active.includes(team) && expected.includes(team)
          ? 'Both'
          : active.includes(team)
            ? 'FA only'
            : 'Thrive only';
      const lbl = short(team);
      if (!teams[lbl]) teams[lbl] = [];
      teams[lbl].push([source, row]);
    }
    for (const name of row.th ? row.th.teams : []) {
      const k = _tkey(name);
      if (!lookup.has(k)) {
        const lbl = `${name} (Thrive)`;
        if (!teams[lbl]) teams[lbl] = [];
        teams[lbl].push(['Thrive only', row]);
      } else if (lookup.get(k) === IGNORE) {
        const lbl = `${name} (Thrive)`;
        if (!teams[lbl]) teams[lbl] = [];
        teams[lbl].push([NO_FA, row]);
      }
    }
  }

  for (const members of Object.values(teams)) {
    members.sort((a, b) => {
      const na = a[1].fa_name || a[1].thrive_name;
      const nb = b[1].fa_name || b[1].thrive_name;
      const sa = lastWordLower(na);
      const sb = lastWordLower(nb);
      if (sa !== sb) return sa < sb ? -1 : 1;
      const faLower = na.toLowerCase();
      const fbLower = nb.toLowerCase();
      return faLower < fbLower ? -1 : faLower > fbLower ? 1 : 0;
    });
  }

  return new Result(rows, prefix, teams);
}

// --------------------------------------------------------------------------- reports

export const RESULT_TABS: Array<[string, (r: Row) => boolean]> = [
  ['All players', () => true],
  ['Needs attention', (r) => r.level === 'bad' || r.level === 'warn'],
  ['In Thrive, not in FA', (r) => r.result === 'Thrive only'],
  ['No FA team (U4-U6, training)', (r) => r.result === 'Thrive only (expected)'],
  ['In FA, not in Thrive', (r) => r.result.startsWith('FA only')],
  ['Check match', (r) => r.result === 'Check match'],
  ['Team differs', (r) => r.result === 'Matched (team differs)'],
  ['Data quality', (r) => Boolean(r.dq)],
];

export const SOURCE_FILLS: Record<string, string> = {
  Both: 'E2F0D9',
  'FA only': 'FCE4D6',
  'Thrive only': 'DDEBF7',
  [NO_FA]: 'EDEDED',
};

export const CONFIDENTIAL =
  "CONFIDENTIAL: contains children's personal data protected by UK GDPR. Share only with those who " +
  'need it, keep it secure and delete it when finished.';

const NOTHING = new Set([
  '',
  'n/a',
  'na',
  'none',
  'no',
  'nil',
  '-',
  'false',
  'not applicable',
]);

export function team_labels(result: Result): string[] {
  return Object.keys(result.teams).sort((a, b) => {
    const ma = /^u0*(\d+)/i.exec(a);
    const mb = /^u0*(\d+)/i.exec(b);
    const na = ma ? Number(ma[1]) : 999;
    const nb = mb ? Number(mb[1]) : 999;
    if (na !== nb) return na - nb;
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
}

export function _meaningful(value: string): boolean {
  const cleaned = (value || '').trim().toLowerCase().replace(/\.+$/, '');
  return !NOTHING.has(cleaned);
}

export function _source(row: Row): string {
  if (row.fa && row.th) return 'Both';
  if (row.fa) return 'FA only';
  return row.result === 'Thrive only (expected)' ? NO_FA : 'Thrive only';
}

export function _fa_mark(source: string): string {
  if (source === NO_FA) return 'FA not needed';
  return 'FA ' + (source === 'Both' || source === 'FA only' ? '✅' : '❌');
}

export function _name_dob(
  row: Row,
  today: LocalDate
): [string, LocalDate | null, number | ''] {
  const dob = row.fa_dob ?? row.thrive_dob;
  return [row.fa_name || row.thrive_name, dob, dob ? _age_on(dob, today) : ''];
}

export function _contact_values(row: Row): string[] {
  const t = row.th ? row.th.fields : {};
  const f = row.fa ? row.fa.fields : {};
  return [
    t.account_owner ?? '',
    t.owner_phone ?? '',
    t.pg_name ?? '',
    t.pg_email ?? '',
    f.parent_name ?? '',
    f.parent_email ?? '',
    f.email ?? '',
    f.emergency ?? '',
    f.emergency_phone ?? '',
  ];
}

export const PLAYER_HEADERS = [
  'Player',
  'DOB',
  'Age',
  'In',
  'FA status',
  'Thrive mandate',
  'Paying through Thrive',
  'Reconciliation note',
];

export const CONTACT_HEADERS = [
  'Account owner (Thrive)',
  'Owner phone (Thrive)',
  'Parent/guardian (Thrive)',
  'Parent/guardian email (Thrive)',
  'Parent/carer (FA)',
  'Parent/carer email (FA)',
  'Player email (FA)',
  'Emergency contact (FA)',
  'Emergency phone (FA)',
];

export const MEDICAL_HEADERS = [
  'Medical info?',
  'Has medical conditions',
  'Medical conditions',
  'Allergies',
  'Medicines',
  'Behavioural conditions',
  'Disabilities',
  'Other conditions',
  'Doctor',
  'Doctor phone',
  'Surgery address',
  'Medical notes',
];

export const CONSENT_HEADERS = [
  'Consents missing',
  'Photography policy',
  'Code of conduct (Thrive)',
  'Club rules (Thrive)',
  'FA consent given',
];

export const CONSENT_ITEMS: Array<[string, string]> = [
  ['photo', 'Photography'],
  ['conduct', 'Code of conduct'],
  ['club_rules', 'Club rules'],
];

const REFUSED = /\b(no|not|don'?t|do not|declined?|refused?|withdrawn?|opt(ed)? out)\b/i;

export function consent_given(value: string): boolean {
  const v = (value || '').trim();
  return _meaningful(v) && !REFUSED.test(v);
}

export function consents_checked(result: Result): Array<[string, string]> {
  return CONSENT_ITEMS.filter(([key]) =>
    result.rows.some((r) => r.th !== null && Boolean((r.th.fields[key] || '').trim()))
  );
}

export function missing_consents(row: Row, checked: Array<[string, string]>): string[] {
  if (row.th === null) return [];
  return checked
    .filter(([key]) => !consent_given(row.th!.fields[key] || ''))
    .map(([, name]) => name);
}

export function _medical_values(row: Row): string[] {
  const t = row.th ? row.th.fields : null;
  const keys = [
    'has_medical',
    'conditions',
    'allergies',
    'medicines',
    'behavioural',
    'disabilities',
    'other',
    'doctor',
    'doctor_phone',
    'surgery',
    'notes',
  ];
  const detail = [
    'conditions',
    'allergies',
    'medicines',
    'behavioural',
    'disabilities',
    'other',
    'notes',
  ];
  if (!t) {
    return ['', ...keys.map(() => '')];
  }
  const hasFlag =
    (t.has_medical || '').toLowerCase() === 'true' ||
    detail.some((k) => _meaningful(t[k] || ''));
  const flag = hasFlag ? 'Yes' : Object.keys(t).length === 0 ? '' : 'No';
  return [flag, ...keys.map((k) => t[k] ?? '')];
}

export function mandate_known(th: ThrivePlayer | null): boolean {
  return th !== null && th.mandate !== MANDATE_UNKNOWN;
}

export function paying_status(row: Row): string {
  if (row.th !== null) {
    if (!mandate_known(row.th)) {
      return 'Unknown: add Active pre-authorisation to the Thrive export';
    }
    return row.th.mandate ? 'Yes' : 'No: no active mandate';
  }
  return row.result === 'FA only' ? 'No: not in Thrive' : 'Not expected (not registered)';
}

export const TEAM_DETAIL_SECTIONS: Array<[string, string[]]> = [
  ['Player', PLAYER_HEADERS],
  ['Contacts', CONTACT_HEADERS],
  ['Medical', MEDICAL_HEADERS],
  ['Consents', CONSENT_HEADERS],
];

export function team_report(
  result: Result,
  label: string,
  include_medical = true,
  today?: LocalDate
): [string[], Array<[unknown[], string]>] {
  const todayDate = today ?? todayLocalDate();
  const headers = [
    ...PLAYER_HEADERS,
    ...CONTACT_HEADERS,
    ...(include_medical ? MEDICAL_HEADERS : []),
    ...CONSENT_HEADERS,
  ];
  const checked = consents_checked(result);
  const rows: Array<[unknown[], string]> = [];
  for (const [source, row] of result.teams[label] || []) {
    const [name, dob, age] = _name_dob(row, todayDate);
    const t = row.th ? row.th.fields : {};
    const f = row.fa ? row.fa.fields : {};
    const mandate = !row.th ? 'Not in Thrive' : row.th.mandate || 'None';
    const values: unknown[] = [
      name,
      dob,
      age,
      source,
      row.fa_status,
      mandate,
      paying_status(row),
      row.issue,
      ..._contact_values(row),
      ...(include_medical ? _medical_values(row) : []),
      checked.length > 0 && row.th
        ? missing_consents(row, checked).join(', ') || 'All given'
        : '',
      t.photo ?? '',
      t.conduct ?? '',
      t.club_rules ?? '',
      f.consent ?? '',
    ];
    rows.push([values, source]);
  }
  return [headers, rows];
}

export function team_view_headers(include_medical = true): string[] {
  return [
    'Player',
    'Paying',
    'Age',
    'In',
    'FA status',
    'Main contact',
    ...(include_medical ? ['Medical'] : []),
    'Consents',
    'Note',
  ];
}

export function paying_label(status: string): string {
  if (status === 'Yes') return '✔ Yes';
  if (status.startsWith('No')) {
    const reason = status.split(':')[1]?.trim() || '';
    return `✖ NOT PAYING (${reason})`;
  }
  if (status.startsWith('Unknown')) {
    return '? Unknown (no mandate column)';
  }
  return status;
}

export function is_unpaid(status: string): boolean {
  return status.startsWith('No');
}

export function team_overview(
  headers: string[],
  values: unknown[],
  include_medical = true
): unknown[] {
  const v: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    v[h] = values[i];
  });
  const contact =
    (v['Account owner (Thrive)'] as string) ||
    (v['Parent/guardian (Thrive)'] as string) ||
    (v['Parent/carer (FA)'] as string) ||
    '';
  const out: unknown[] = [
    v['Player'],
    paying_label(String(v['Paying through Thrive'] ?? '')),
    v['Age'],
    v['In'],
    v['FA status'],
    contact,
  ];
  if (include_medical) {
    const flag = (v['Medical info?'] as string) || 'Not known';
    out.push(flag === 'Yes' ? '⚠ Yes' : flag);
  }
  const consents = String(v['Consents missing'] ?? '');
  out.push(!consents ? '' : consents === 'All given' ? '✔' : '✖ ' + consents);
  out.push(v['Reconciliation note']);
  return out;
}

export const NOT_PAYING_NOTE =
  'Players with no active Thrive mandate, or registered with the FA but not found in Thrive. ' +
  'FA-only players may be in Thrive under a different name: check before chasing.';

export function not_paying_report(
  result: Result,
  today?: LocalDate
): [string[], Array<[unknown[], string]>] {
  const todayDate = today ?? todayLocalDate();
  const headers = [
    'Player',
    'DOB',
    'Age',
    'Team(s)',
    'Reason',
    'In',
    'Account owner (Thrive)',
    'Owner phone (Thrive)',
    'Parent/guardian (Thrive)',
    'Parent/guardian email (Thrive)',
    'Parent/carer (FA)',
    'Parent/carer email (FA)',
    'Emergency contact (FA)',
    'Emergency phone (FA)',
  ];
  const rows: Array<[unknown[], string]> = [];
  for (const row of result.rows) {
    let reason: string;
    if (row.th !== null && !row.th.mandate) {
      reason = 'No active mandate in Thrive';
    } else if (row.result === 'FA only') {
      reason = 'Registered in FA, not found in Thrive';
    } else {
      continue;
    }
    const [name, dob, age] = _name_dob(row, todayDate);
    const c = _contact_values(row);
    const src = _source(row);
    rows.push([
      [
        name,
        dob,
        age,
        row.fa_teams || row.thrive_teams,
        reason,
        src,
        ...c.slice(0, 4),
        ...c.slice(4, 6),
        ...c.slice(7, 9),
      ],
      src,
    ]);
  }
  rows.sort((a, b) => {
    const ra = String(a[0][4]);
    const rb = String(b[0][4]);
    if (ra !== rb) return ra < rb ? -1 : 1;
    const sa = lastWordLower(String(a[0][0]));
    const sb = lastWordLower(String(b[0][0]));
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return [headers, rows];
}

export const CONSENTS_NOTE =
  "Players in Thrive with a consent not given: blank, 'No', declined or similar. Check the answer " +
  'shown, and do not photograph anyone without photography consent.';

export function consents_report(
  result: Result,
  today?: LocalDate
): [string[], Array<[unknown[], string]>, string[]] {
  const todayDate = today ?? todayLocalDate();
  const checked = consents_checked(result);
  const headers = [
    'Player',
    'Age',
    'Team(s)',
    'Missing',
    ...checked.map(([, name]) => name),
    'Account owner (Thrive)',
    'Owner phone (Thrive)',
    'Parent/guardian email (Thrive)',
  ];
  const rows: Array<[unknown[], string]> = [];
  for (const row of result.rows) {
    const missing = missing_consents(row, checked);
    if (missing.length === 0) continue;
    const [name, , age] = _name_dob(row, todayDate);
    const t = row.th!.fields;
    rows.push([
      [
        name,
        age,
        row.thrive_teams || row.fa_teams,
        missing.join(', '),
        ...checked.map(([key]) => t[key] || '(blank)'),
        t.account_owner ?? '',
        t.owner_phone ?? '',
        t.pg_email ?? '',
      ],
      _source(row),
    ]);
  }
  rows.sort((a, b) => {
    const pa = !String(a[0][3]).includes('Photography') ? 1 : 0;
    const pb = !String(b[0][3]).includes('Photography') ? 1 : 0;
    if (pa !== pb) return pa - pb;
    const ta = String(a[0][2]).toLowerCase();
    const tb = String(b[0][2]).toLowerCase();
    if (ta !== tb) return ta < tb ? -1 : 1;
    const sa = lastWordLower(String(a[0][0]));
    const sb = lastWordLower(String(b[0][0]));
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return [headers, rows, checked.map(([, n]) => n)];
}

// --------------------------------------------------------------------------- managers file

const TEAM_HEADERS = [
  'team',
  'teams',
  'team(s)',
  'assigned teams',
  'assigned team',
  'age group',
  'squad',
];
const NO_PEOPLE = ['phone', 'mobile', 'tel', 'email', 'e-mail'];

export function _split_list(text: string): string[] {
  return String(text || '')
    .split(/\s*(?:,|;|\/|&|\n|\band\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

export const STAFF_HELP =
  'Expected either: a Name column, a Role column (Manager or Assistant manager) and a Team(s) column, ' +
  'or one row per team with Team, Manager and Assistant manager columns.';

export function loadStaffFromSheets(sheets: unknown[][][], fileName = 'managers.xlsx'): Staff[] {
  const people = new Map<string, Staff>();

  function add(name: string, role: string, teams: string[], phone = '', email = ''): void {
    const temp = new Staff(name, role);
    const key = `${name.toLowerCase()}::${temp.kind}`;
    let p = people.get(key);
    if (!p) {
      p = new Staff(name, role);
      people.set(key, p);
    }
    for (const t of teams) {
      if (!p.teams.includes(t)) {
        p.teams.push(t);
      }
    }
    p.phone = p.phone || phone;
    p.email = p.email || email;
  }

  for (const rows of sheets) {
    const limit = Math.min(rows.length, 15);
    for (let i = 0; i < limit; i++) {
      const row = rows[i] || [];
      const cols: Record<string, number> = {};
      row.forEach((c, j) => {
        const h = _hdr(c);
        if (h) cols[h] = j;
      });
      const team_i = _find_col(cols, TEAM_HEADERS);
      if (team_i === null) continue;
      const name_i = _find_col(cols, ['name', 'full name', 'person', 'staff']);
      const role_i = _find_col(cols, ['role', 'position', 'job']);
      const phone_i = _find_col(cols, ['phone', 'mobile', 'telephone', 'tel']);
      const email_i = _find_col(cols, ['email', 'e-mail']);
      const mgr = Object.entries(cols)
        .filter(
          ([h, j]) =>
            h.includes('manager') &&
            !h.includes('assist') &&
            !NO_PEOPLE.some((x) => h.includes(x)) &&
            j !== team_i
        )
        .map(([, j]) => j);
      const asst = Object.entries(cols)
        .filter(
          ([h, j]) =>
            ['assist', 'asst', 'deputy'].some((w) => h.includes(w)) &&
            !NO_PEOPLE.some((x) => h.includes(x)) &&
            j !== team_i
        )
        .map(([, j]) => j);
      if (name_i === null && mgr.length === 0 && asst.length === 0) continue;

      for (const r of rows.slice(i + 1)) {
        const teams = _split_list(_cell(r, team_i));
        if (name_i !== null) {
          const name = _cell(r, name_i);
          if (name) {
            add(
              name,
              _cell(r, role_i) || 'Manager',
              teams,
              _cell(r, phone_i),
              _cell(r, email_i)
            );
          }
        } else {
          for (const j of mgr) {
            for (const name of _split_list(_cell(r, j))) {
              add(name, 'Manager', teams);
            }
          }
          for (const j of asst) {
            for (const name of _split_list(_cell(r, j))) {
              add(name, 'Assistant manager', teams);
            }
          }
        }
      }
      if (people.size > 0) {
        return Array.from(people.values());
      }
    }
  }
  const base = fileName.split(/[\\/]/).pop() || fileName;
  throw new ReportError(`${base} does not look like a managers file. ${STAFF_HELP}`);
}

export function attach_staff(
  result: Result,
  staff: Staff[],
  team_map: Record<string, string | null>
): void {
  result.staff = {};
  result.staff_issues = [];
  if (!staff || staff.length === 0) return;
  const prefix = result.club_prefix;
  const forms: Record<string, string> = {};
  for (const label of Object.keys(result.teams)) {
    forms[_team_form(label.replace(' (Thrive)', ''), '')] = label;
  }
  const via_thrive: Record<string, string> = {};
  for (const [thrive_name, fa_name] of Object.entries(team_map)) {
    if (fa_name) {
      const short =
        prefix && fa_name.startsWith(prefix) ? fa_name.slice(prefix.length).trim() : fa_name;
      via_thrive[_team_form(thrive_name, '')] = short;
    }
  }
  for (const person of staff) {
    for (const text of person.teams) {
      const form = _team_form(text, prefix);
      const via = via_thrive[form];
      const label = forms[form] || (via && via in result.teams ? via : null);
      if (!label) {
        result.staff_issues.push(
          `${person.name}: team '${text}' was not found in the FA or Thrive files`
        );
      } else {
        if (!result.staff[label]) result.staff[label] = [];
        if (!result.staff[label].includes(person)) {
          result.staff[label].push(person);
        }
      }
    }
  }
  for (const label of team_labels(result)) {
    if (
      !label.endsWith('(Thrive)') &&
      !(result.staff[label] || []).some((p) => p.kind === 'manager')
    ) {
      result.staff_issues.push(`Team ${label} has no manager listed`);
    }
  }
}

export function staff_lines(result: Result, label: string): string[] {
  const lines: string[] = [];
  const people = result.staff[label] || [];
  const roles: Array<['manager' | 'assistant' | 'other', string]> = [
    ['manager', 'Manager'],
    ['assistant', 'Assistant manager'],
    ['other', 'Other staff'],
  ];
  for (const [kind, title] of roles) {
    const names = people.filter((p) => p.kind === kind).map((p) => p.name);
    if (names.length > 0) {
      lines.push(
        `${title}${names.length > 1 && kind !== 'other' ? 's' : ''}: ${names.join(', ')}`
      );
    }
  }
  return lines;
}

export function staff_phones(result: Result, label: string, kind = 'manager'): string {
  const numbers = (result.staff[label] || [])
    .filter((p) => p.kind === kind && Boolean(p.phone))
    .map((p) => p.phone.replace(/[^\d+]/g, ''))
    .filter(Boolean);
  return numbers.join(', ');
}

export function team_choice_label(result: Result, label: string): string {
  const managers = (result.staff[label] || [])
    .filter((p) => p.kind === 'manager' && Boolean(p.name))
    .map((p) => p.name);
  return managers.length > 0 ? `${label} (${managers.join(', ')})` : label;
}

// --------------------------------------------------------------------------- WhatsApp text

export const WHATSAPP_LIMIT = 3500;
export const SQUAD_FOOTNOTE =
  '_Data protection: this message contains personal data about children (UK GDPR). Use it only to ' +
  'run the team, do not forward or share it, keep it secure and delete it when no longer needed._';
export const MEDICAL_FOOTNOTE =
  "_Data protection: this message contains children's medical information, which is special " +
  'category data under UK GDPR. Use it only to keep players safe, do not forward or share it, ' +
  'keep it secure and delete it when no longer needed. It comes from Thrive and may be ' +
  'incomplete._';
export const NOT_PAYING_FOOTNOTE =
  '*Buy membership (if not in Thrive):*\n' +
  'https://book.thrive4.com/#/app/joinin/organisation/shop/a8b9edae-1af1-4df8-afe5-73e73f066998\n\n' +
  '*How to set up a Direct Debit mandate:*\n' +
  '1. Go to the Member Portal: https://member.thrive4.com/\n' +
  '2. Log in: If prompted, sign in with your Thrive4 MemberHub credentials (your existing LoveAdmin login) to reach the Dashboard.\n' +
  '3. Open Account, then Settings: In the left-hand menu, click "Account" to expand it, then select "Settings".\n' +
  '4. Open Payment Settings: On the Settings page, click "Payment Settings".\n' +
  '5. Set up the mandate: Under Mandates, click "Set up". Follow the on-screen prompts to enter your bank details.';




export function _phone(text: string): string {
  const out: string[] = [];
  for (const part of _split_list(String(text || '').replace(/\//g, ','))) {
    const digits = part.replace(/\D/g, '');
    out.push(
      digits.length === 11 && digits.startsWith('0')
        ? `${digits.slice(0, 5)} ${digits.slice(5)}`
        : part
    );
  }
  return out.join(', ');
}

export function _pack_messages(
  head: string[],
  blocks: string[],
  footnote: string,
  limit = WHATSAPP_LIMIT
): string[] {
  const fixed = head.join('\n').length + footnote.length + 8;
  const parts: string[][] = [[]];
  let size = fixed;
  for (const block of blocks) {
    const lastPart = parts[parts.length - 1];
    if (lastPart.length > 0 && size + block.length + 2 > limit) {
      parts.push([]);
      size = fixed;
    }
    parts[parts.length - 1].push(block);
    size += block.length + 2;
  }
  return parts.map((chunk, idx) => {
    const heading = [...head];
    if (parts.length > 1) {
      heading[0] += ` (part ${idx + 1} of ${parts.length})`;
    }
    return heading.join('\n') + '\n\n' + chunk.join('\n\n') + '\n\n' + footnote;
  });
}

export function _mandate_mark(row: Row): string {
  if (row.th !== null && !mandate_known(row.th)) return '❓';
  return row.th !== null && Boolean(row.th.mandate) ? '✅' : '❌';
}

export function whatsapp_squad(
  result: Result,
  label: string,
  today?: LocalDate,
  limit = WHATSAPP_LIMIT
): string[] {
  const todayDate = today ?? todayLocalDate();
  const members = result.teams[label] || [];
  const head = [
    `*${label}* squad (${members.length} players)`,
    ...staff_lines(result, label).map((x) => `_${x}_`),
    `Updated ${formatDate(todayDate)}`,
  ];
  const checked = consents_checked(result);
  const blocks: string[] = [];
  for (const [source, row] of members) {
    const [name, , age] = _name_dob(row, todayDate);
    const t = row.th ? row.th.fields : {};
    const f = row.fa ? row.fa.fields : {};
    const mark = (ok: boolean) => (ok ? '✅' : '❌');
    const lines = [
      `*${name}*` + (age !== '' ? ` (${age})` : ''),
      `${_fa_mark(source)}  Thrive ${mark(row.th !== null)}  Direct debit ${_mandate_mark(row)}`,
    ];
    const contactName = t.account_owner || t.pg_name || f.parent_name || '';
    const contactPhone = _phone(t.owner_phone || '');
    const contact = [contactName, contactPhone].filter(Boolean).join(' ');
    const emergency = [f.emergency || '', _phone(f.emergency_phone || '')]
      .filter(Boolean)
      .join(' ');
    if (contact) {
      lines.push(`Contact: ${contact}`);
    }
    if (emergency && emergency !== contact) {
      lines.push(`Emergency: ${emergency}`);
    }
    const missing = missing_consents(row, checked);
    if (missing.includes('Photography')) {
      lines.push('📷 *No photography consent*: do not photograph');
    }
    const other = missing.filter((m) => m !== 'Photography');
    if (other.length > 0) {
      lines.push('Consent missing: ' + other.join(', '));
    }
    blocks.push(lines.join('\n'));
  }
  return _pack_messages(head, blocks, SQUAD_FOOTNOTE, limit);
}

export function _not_paying(row: Row): boolean {
  return (row.th !== null && !row.th.mandate) || row.result === 'FA only';
}

export function not_paying_by_team(result: Result): Record<string, Array<[string, Row]>> {
  const out: Record<string, Array<[string, Row]>> = {};
  const placed = new Set<Row>();
  for (const label of team_labels(result)) {
    const members = (result.teams[label] || []).filter(([, row]) => _not_paying(row));
    if (members.length > 0) {
      out[label] = members;
      for (const [, row] of members) {
        placed.add(row);
      }
    }
  }
  const loose: Array<[string, Row]> = result.rows
    .filter((row) => _not_paying(row) && !placed.has(row))
    .map((row) => [_source(row), row]);
  if (loose.length > 0) {
    out['No team'] = loose;
  }
  return out;
}

export function whatsapp_not_paying(
  result: Result,
  team: string | null = null,
  today?: LocalDate,
  limit = WHATSAPP_LIMIT
): string[] {
  const todayDate = today ?? todayLocalDate();
  const allGroups = not_paying_by_team(result);
  const groups: Record<string, Array<[string, Row]>> =
    team !== null ? { [team]: allGroups[team] || [] } : allGroups;
  const blocks: string[] = [];
  let total = 0;
  for (const [label, members] of Object.entries(groups)) {
    const lines = [`*${label}*`];
    for (const [, row] of members) {
      const name = row.fa_name || row.thrive_name;
      lines.push(
        `*${name}* (${label})\n` +
          [
            ...(row.th === null ? ['   ❌ *NOT SIGNED UP IN THRIVE (NO MEMBERSHIP)*'] : []),
            ...(row.th === null || !row.th.mandate
              ? ['   ❌ *NO ACTIVE DIRECT DEBIT MANDATE SET UP*']
              : []),
          ].join('\n')
      );
      total += 1;
    }
    if (lines.length === 1) {
      lines.push('Everyone in this team is paying through Thrive.');
    }
    blocks.push(lines.join('\n'));
  }
  const managers = team
    ? (result.staff[team] || [])
        .filter((p) => p.kind === 'manager' && p.name.trim())
        .map((p) => p.name.trim().split(/\s+/)[0])
    : [];
  const greeting = managers.length > 0 ? `Hi ${managers.join(', ')},` : 'Hi,';
  const teamPart = team ? `*${team}* ` : '';
  const intro =
    `${greeting} the following ${teamPart}player(s) are currently showing as not paying fees in Thrive. ` +
    'Please pass the links and instructions below on to their parents to get this set up:';
  const title = '*Currently not paying fees*' + (team ? `: ${team}` : '');
  const head = [intro, '', title, `${total} player(s)`, `Updated ${formatDate(todayDate)}`];
  return _pack_messages(head, blocks, NOT_PAYING_FOOTNOTE, limit);
}

export function whatsapp_medical(
  result: Result,
  label: string,
  today?: LocalDate,
  limit = WHATSAPP_LIMIT
): string[] {
  const todayDate = today ?? todayLocalDate();
  const members = result.teams[label] || [];
  const blocks: string[] = [];
  const medFields: Array<[string, string]> = [
    ['Medical', 'conditions'],
    ['Medicines', 'medicines'],
    ['Allergies', 'allergies'],
    ['Behavioural', 'behavioural'],
    ['Disabilities', 'disabilities'],
    ['Other', 'other'],
    ['Notes', 'notes'],
  ];
  for (const [, row] of members) {
    const t = row.th ? row.th.fields : {};
    if (_medical_values(row)[0] !== 'Yes') continue;
    const [name, , age] = _name_dob(row, todayDate);
    const lines = [`*${name}*` + (age !== '' ? ` (${age})` : '')];
    for (const [title, key] of medFields) {
      if (_meaningful(t[key] || '')) {
        lines.push(`${title}: ${t[key]}`);
      }
    }
    if (lines.length === 1) {
      lines.push('Medical conditions recorded but no details given');
    }
    blocks.push(lines.join('\n'));
  }
  const head = [
    `*${label}* medical alerts`,
    `${blocks.length} of ${members.length} players have medical information recorded`,
    `Updated ${formatDate(todayDate)}`,
  ];
  const finalBlocks =
    blocks.length > 0 ? blocks : ['No medical information is recorded for this team.'];
  return _pack_messages(head, finalBlocks, MEDICAL_FOOTNOTE, limit);
}

// --------------------------------------------------------------------------- Columns & Matchday Data

export const COLUMNS: Array<[string, keyof Row, number]> = [
  ['Result', 'result', 24],
  ['Match', 'confidence', 18],
  ['Issue', 'issue', 60],
  ['Data quality', 'dq', 60],
  ['FAN ID', 'fan_id', 12],
  ['FA name', 'fa_name', 24],
  ['Thrive name', 'thrive_name', 24],
  ['FA DOB', 'fa_dob', 12],
  ['Thrive DOB', 'thrive_dob', 12],
  ['FA team(s)', 'fa_teams', 22],
  ['Thrive team(s)', 'thrive_teams', 30],
  ['Thrive mapped to', 'expected_fa_teams', 22],
  ['FA status', 'fa_status', 14],
  ['Thrive mandate', 'mandate', 18],
];

export const FILLS: Record<Level, string> = {
  ok: 'E2F0D9',
  warn: 'FFF2CC',
  bad: 'F8CBAD',
  info: 'EDEDED',
};

export const MATCHDAY_NOTE =
  'Keep this sheet with the team kit, out of sight. Destroy it when the squad or details change. ' +
  'Medical details come from Thrive and may be incomplete: ask parents if unsure.';

export function matchday_rows(
  result: Result,
  label: string,
  include_medical = true,
  today?: LocalDate
): [string[], unknown[][], Array<Set<'medical' | 'no_photo'>>] {
  const todayDate = today ?? todayLocalDate();
  const photo_checked = consents_checked(result).some(([k]) => k === 'photo');
  const headers = [
    'Here',
    'Player',
    'Age',
    'Parent / contact',
    'Contact phone',
    'Emergency contact',
    'Emergency phone',
    ...(include_medical ? ['Medical alert'] : []),
    ...(photo_checked ? ['Photos OK'] : []),
  ];
  const rows: unknown[][] = [];
  const flags: Array<Set<'medical' | 'no_photo'>> = [];

  for (const [, row] of result.teams[label] || []) {
    const [name, , age] = _name_dob(row, todayDate);
    const t = row.th ? row.th.fields : {};
    const f = row.fa ? row.fa.fields : {};
    const contact = t.account_owner || t.pg_name || f.parent_name || '';
    const phone = _phone(t.owner_phone || '');
    const values: unknown[] = [
      '',
      name,
      age,
      contact,
      phone,
      f.emergency || '',
      _phone(f.emergency_phone || ''),
    ];
    const flag = new Set<'medical' | 'no_photo'>();
    if (include_medical) {
      let alert = '';
      if (_medical_values(row)[0] === 'Yes') {
        const parts = [
          'conditions',
          'allergies',
          'medicines',
          'behavioural',
          'disabilities',
          'other',
          'notes',
        ]
          .map((k) => t[k] || '')
          .filter((v) => _meaningful(v));
        alert = parts.join('; ') || 'Medical conditions recorded: check with parent';
        flag.add('medical');
      }
      values.push(alert);
    }
    if (photo_checked) {
      const ok = row.th !== null && consent_given(t.photo || '');
      values.push(ok ? 'Yes' : 'NO');
      if (!ok) {
        flag.add('no_photo');
      }
    }
    rows.push(values);
    flags.push(flag);
  }
  return [headers, rows, flags];
}
