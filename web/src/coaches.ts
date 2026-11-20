/**
 * Coaches reconciliation from the FA Team Qualifications Report (Whole Game System, Reports > Team Qualifications
 * Report): each team official's teams, roles, highest coaching qualification and First Aid, Safeguarding Children
 * and DBS expiry, with expiry windows (expired or not held, within 1, 3 and 6 months) and a comparison with the
 * club's managers / club officials file. Mirrors src/coaches.py. Web-only module, so reconcile_core parity is
 * unchanged. Runs in the browser: nothing is uploaded.
 */
import * as rc from './reconcile_core';
import type { Official } from './club_pdf';

export const QUAL_HEADERS = ['fan', 'name', 'first aid expiry', 'safeguarding children expiry', 'dbs expiry'];
export type CertKey = 'first_aid' | 'safeguarding' | 'dbs';
export const CERTS: Array<[CertKey, string]> = [
  ['first_aid', 'First Aid'],
  ['safeguarding', 'Safeguarding'],
  ['dbs', 'DBS'],
];
export const QUAL_HOW_TO =
  'To get the FA Team Qualifications Report: in the Whole Game System (https://wgs.thefa.com/) go to Reports, ' +
  'choose Team Qualifications Report and export it to Excel.';

export const EXPIRED = 'Expired';
export const NOT_HELD = 'Not held';
export const M1 = 'Within 1 month';
export const M3 = '1 to 3 months';
export const M6 = '3 to 6 months';
export const OK = '6 months or more';
export const UNKNOWN = 'Unknown';
/** Colour for each band, used by the app and the PDF: red, light red, orange, yellow, green; grey for not held. */
export const WINDOW_COLOURS: Record<string, string> = {
  [EXPIRED]: '#F4A3A3', [M1]: '#FFC7CE', '1 to 3 months': '#F8CBAD', '3 to 6 months': '#FFF2CC',
  '6 months or more': '#E2F0D9', 'Not held': '#D9D9D9', Unknown: '#FFFFFF',
};
export const WINDOWS: Array<[number, string]> = [
  [1, M1],
  [3, M3],
  [6, M6],
];

const COACH_NICKNAMES: Record<string, string> = {
  rick: 'richard', ricky: 'richard', rich: 'richard', dick: 'richard', jamie: 'james', jim: 'james',
  andy: 'andrew', drew: 'andrew', tony: 'anthony', mike: 'michael', mick: 'michael', nick: 'nicholas',
  jon: 'jonathan', jonny: 'jonathan', jonathon: 'jonathan', kate: 'katherine', katie: 'katherine',
  bill: 'william', liz: 'elizabeth', beth: 'elizabeth', sue: 'susan', pete: 'peter', ste: 'stephen',
  steve: 'stephen', steven: 'stephen', stuart: 'stewart', geoff: 'geoffrey', dave: 'david', davey: 'david',
  ged: 'gerard', gaz: 'gary', baz: 'barry', al: 'alan',
};

export interface Cert {
  status: 'valid' | 'expiring' | 'expired' | 'not held' | 'unknown';
  expiry: rc.LocalDate | null;
  raw: string;
}

export interface Coach {
  fan: string;
  name: string;
  teams: string[];
  roles: string[];
  team_roles: Record<string, string[]>; // team -> FA roles on that team
  coaching: string;
  certs: Record<CertKey, Cert>;
  official: string;
  note: string;
  phone?: string;
}

export interface TeamQual {
  team: string;
  age: string;
  complete: string;
  adult_first_aid: string;
}

export interface CoachesResult {
  coaches: Coach[];
  teams: TeamQual[];
  report_date: string;
  not_in_fa: Array<[string, string, string]>;
  officials_checked: boolean;
}

const dnum = (d: rc.LocalDate) => d.year * 10000 + d.month * 100 + d.day;

/** The same day `months` later (the last day of the month when that day does not exist). */
export function add_months(d: rc.LocalDate, months: number): rc.LocalDate {
  const total = d.month - 1 + months;
  const year = d.year + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(d.day, last) };
}

function toDate(value: unknown): rc.LocalDate | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(value ?? ''));
  if (!m) return null;
  const d = { year: Number(m[3]), month: Number(m[2]), day: Number(m[1]) };
  const check = new Date(Date.UTC(d.year, d.month - 1, d.day));
  return check.getUTCMonth() === d.month - 1 ? d : null;
}

/** '21/01/2028', 'Expiring (01/02/2027)', 'Expired', 'Not Held' or blank. */
export function parse_cert(value: unknown): Cert {
  const raw = value instanceof Date ? '' : String(value ?? '').trim();
  const low = raw.toLowerCase();
  if (low.startsWith('expired')) return { status: 'expired', expiry: toDate(raw), raw };
  if (low.includes('not held') || ['none', 'n/a', 'no'].includes(low)) return { status: 'not held', expiry: null, raw };
  const d = toDate(value);
  if (d) return { status: low.startsWith('expiring') ? 'expiring' : 'valid', expiry: d, raw };
  return { status: raw ? 'unknown' : 'not held', expiry: null, raw };
}

/** Expired, Not held, Within 1 month, 1 to 3 months, 3 to 6 months, OK or Unknown. */
export function cert_window(cert: Cert, today: rc.LocalDate): string {
  if (cert.status === 'expired') return EXPIRED;
  if (cert.status === 'not held') return NOT_HELD;
  if (!cert.expiry) return UNKNOWN;
  if (dnum(cert.expiry) < dnum(today)) return EXPIRED;
  for (const [months, name] of WINDOWS) {
    if (dnum(cert.expiry) <= dnum(add_months(today, months))) return name;
  }
  return OK;
}

export function cert_text(cert: Cert): string {
  if (cert.expiry) return rc.formatDate(cert.expiry);
  if (cert.status === 'expired') return 'Expired';
  if (cert.status === 'not held') return 'Not held';
  return cert.raw || '-';
}

function shortTeam(team: string): string {
  const m = /\bu\d+\b.*/i.exec(team);
  return m ? m[0].trim() : team.trim();
}

function surnameKey(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return `${(parts[parts.length - 1] || '').toLowerCase()}\u0000${name.toLowerCase()}`;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const teamKey = (t: string) => rc._team_age_limit(t) ?? 999;

export function is_qualifications_report(sheets: unknown[][][]): boolean {
  return sheets.some((rows) =>
    rows.slice(0, 40).some((row) => {
      const cells = (row || []).map((c) => rc._hdr(c));
      return QUAL_HEADERS.every((h) => cells.includes(h));
    })
  );
}

/** Read the FA Team Qualifications Report. Team columns are merged over each team's rows, so they are carried
 * down. A person on several teams is one Coach with all their teams. */
export function parse_qualifications(sheets: unknown[][][]): CoachesResult {
  for (const rows of sheets) {
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const cols: Record<string, number> = {};
      (rows[i] || []).forEach((c, j) => {
        const h = rc._hdr(c);
        if (h && !(h in cols)) cols[h] = j;
      });
      if (!QUAL_HEADERS.every((h) => h in cols)) continue;
      const ageI = rc._find_col(cols, ['team age']);
      const teamI = rc._find_col(cols, ['team name', 'team']);
      const roleI = rc._find_col(cols, ['team roles', 'team role', 'role']);
      const coachI = rc._find_col(cols, ['highest coaching qualification', 'coaching qualification']);
      const youthI = Object.entries(cols).find(([h]) => h.startsWith('youth team'))?.[1] ?? null;
      const adultI = Object.entries(cols).find(([h]) => h.startsWith('adult team'))?.[1] ?? null;
      let reportDate = '';
      for (const r of rows.slice(0, i)) {
        if (['date & time:', 'date and time:', 'date & time'].includes(rc._hdr((r || [])[0]))) {
          reportDate = rc._cell(r || [], 1);
        }
      }
      const coaches = new Map<string, Coach>();
      const teams = new Map<string, TeamQual>();
      let age = '';
      let team = '';
      for (const r0 of rows.slice(i + 1)) {
        const r = r0 || [];
        if (!r.some((c) => String(c ?? '').trim())) {
          if (coaches.size) break; // the definitions below the table
          continue;
        }
        age = rc._cell(r, ageI) || age;
        if (rc._cell(r, teamI)) {
          team = shortTeam(rc._cell(r, teamI));
          if (!teams.has(team)) {
            teams.set(team, { team, age, complete: rc._cell(r, youthI), adult_first_aid: rc._cell(r, adultI) });
          }
        }
        const fan = rc._cell(r, cols['fan']);
        const name = rc._cell(r, cols['name']);
        if (!name) continue;
        const key = fan || name.toLowerCase();
        let c = coaches.get(key);
        if (!c) {
          c = {
            fan, name, teams: [], roles: [], team_roles: {}, coaching: rc._cell(r, coachI), official: '', note: '',
            certs: {
              first_aid: parse_cert(r[cols['first aid expiry']]),
              safeguarding: parse_cert(r[cols['safeguarding children expiry']]),
              dbs: parse_cert(r[cols['dbs expiry']]),
            },
          };
          coaches.set(key, c);
        }
        if (team && !c.teams.includes(team)) c.teams.push(team);
        const role = rc._cell(r, roleI);
        if (role && !c.roles.includes(role)) c.roles.push(role);
        if (team && role) {
          const list = (c.team_roles[team] ??= []);
          if (!list.includes(role)) list.push(role);
        }
        c.coaching = c.coaching || rc._cell(r, coachI);
      }
      if (coaches.size) {
        return {
          coaches: [...coaches.values()].sort((a, b) => cmp(surnameKey(a.name), surnameKey(b.name))),
          teams: [...teams.values()].sort((a, b) => teamKey(a.team) - teamKey(b.team) ||
            cmp(a.team.toLowerCase(), b.team.toLowerCase())),
          report_date: reportDate,
          not_in_fa: [],
          officials_checked: false,
        };
      }
    }
  }
  throw new rc.ReportError(
    'This does not look like the FA Team Qualifications Report (expected FAN, Name, First Aid Expiry, ' +
      'Safeguarding Children Expiry and DBS Expiry columns). ' + QUAL_HOW_TO
  );
}

function firstName(name: string): string {
  const s = rc.squash(name);
  return COACH_NICKNAMES[s] ?? s;
}

/** 'Chris Nestor' and 'Christopher Nestor', 'Rick Worden' and 'Richard Worden' are the same person. */
export function same_person(a: string, b: string, fuzzy = rc.DEFAULT_FUZZY): boolean {
  const pa = a.split(/\s+/).filter(Boolean);
  const pb = b.split(/\s+/).filter(Boolean);
  if (pa.length < 2 || pb.length < 2) return Boolean(rc.squash(a)) && rc.squash(a) === rc.squash(b);
  if (!rc._name_score(pa[pa.length - 1], pb[pb.length - 1], true, fuzzy)) return false;
  const fa = firstName(pa[0]);
  const fb = firstName(pb[0]);
  return fa === fb || rc._name_score(fa, fb, false, fuzzy) > 0 || rc._name_score(pa[0], pb[0], false, fuzzy) > 0;
}

/** 'U8 White Sunday' and 'U8 White' are the same team; 'U08 Blue' and 'U8 Blue' too. */
export function same_team(a: string, b: string): boolean {
  const fa = rc._team_form(a, '');
  const fb = rc._team_form(b, '');
  return fa === fb || fa.startsWith(fb + ' ') || fb.startsWith(fa + ' ');
}

function isTeamRole(role: string): boolean {
  const r = role.toLowerCase();
  return ['manager', 'coach', 'assist', 'asst', 'lead'].some((w) => r.includes(w)) && !/^u0*\d+\s/.test(r);
}

/** Compare with the managers / club officials file: who is in the FA report but not the file, who has a team
 * role in the file but is not in the FA report, and team differences. */
export function reconcile_coaches(result: CoachesResult, officials: Official[]): CoachesResult {
  result.officials_checked = officials.length > 0;
  result.not_in_fa = [];
  if (!officials.length) return result;
  const people = officials.filter((o) => o.name);
  for (const c of result.coaches) {
    const match = people.find((o) => same_person(c.name, o.name));
    if (!match) {
      c.official = '';
      c.note = 'Not in the officials file';
      continue;
    }
    c.official = match.name;
    c.phone = match.phone || '';
    const notes: string[] = [];
    const missing = match.teams.filter((t) => !c.teams.some((x) => same_team(t, x)));
    const extra = c.teams.filter((t) => !match.teams.some((x) => same_team(t, x)));
    if (missing.length) notes.push(`Not on ${missing.join(', ')} in the FA report`);
    if (extra.length && match.teams.length) notes.push(`Not listed for ${extra.join(', ')} in the officials file`);
    c.note = notes.join('; ');
  }
  for (const o of people) {
    const roles = [o.role, o.second_role].filter((r) => r && isTeamRole(r));
    if (roles.length && o.teams.length && !result.coaches.some((c) => same_person(c.name, o.name))) {
      result.not_in_fa.push([o.name, roles.join(', '), o.teams.join(', ')]);
    }
  }
  return result;
}

/** 'U9 White: Assistant Team Coach; U12 Black: Team Coach' (each team with its FA role). */
export function fa_roles_text(c: Coach): string {
  return c.teams.map((t) => `${t}: ${(c.team_roles[t] || []).join(', ') || 'no role'}`).join('; ');
}

/** The club file's role for an FA team role: Team Coach and Team Manager are Manager, Assistant Team Coach is
 * Assistant manager (as the club officials file notes say); anything else is kept as the FA writes it. */
export function file_role(faRole: string): string {
  const r = faRole.toLowerCase();
  if (r.includes('assist')) return 'Assistant manager';
  if (['team coach', 'team manager', 'head coach', 'manager', 'coach'].includes(r)) return 'Manager';
  return faRole;
}

function mainRole(c: Coach): string {
  const roles = c.roles.map(file_role);
  for (const wanted of ['Manager', 'Assistant manager']) if (roles.includes(wanted)) return wanted;
  return roles[0] || 'Manager';
}

/** [FA role, name] for everyone the FA report has on a team, managers and coaches first. */
export function team_staff(result: CoachesResult, team: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const c of result.coaches) {
    for (const t of c.teams) {
      if (!same_team(t, team)) continue;
      const roles = c.team_roles[t]?.length ? c.team_roles[t] : ['Team official'];
      for (const role of roles) out.push([role, c.name]);
    }
  }
  const rank: Record<string, number> = { 'team manager': 0, 'team coach': 1, 'assistant team coach': 2 };
  return out.sort((a, b) => (rank[a[0].toLowerCase()] ?? 3) - (rank[b[0].toLowerCase()] ?? 3) ||
    cmp(surnameKey(a[1]), surnameKey(b[1])));
}

/** True when the FA report lists this team (so a missing person there is a real difference). */
export function covers_team(result: CoachesResult, team: string): boolean {
  return result.teams.some((t) => same_team(t.team, team));
}

// --------------------------------------------------------------------------- updated officials file

export const UPDATE_STANDARD_HEADERS = ['Name', 'Role', 'Second role', 'Exec Member', 'Team(s)', 'Phone', 'Email'];
export const UPDATE_EXTRA_HEADERS = ['FAN', 'FA teams and roles', 'Notes', 'Changes'];
export const ADDED = 'added';
export const UPDATED = 'updated';
export const NOT_IN_FA = 'not in FA';

function cellText(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return rc.formatDate({ year: v.getUTCFullYear(), month: v.getUTCMonth() + 1, day: v.getUTCDate() });
  }
  return rc._s(v);
}

/** The officials (or one-row-per-person managers) sheet with the FA report merged in. rows: the sheet's rows, or
 * null for no file. Returns [headers, [values, status]] where status is 'added', 'updated', 'not in FA' or ''.
 * Nobody is removed; names, roles, phones and emails already in the file are kept. Mirrors src/coaches.py. */
export function updated_officials_table(
  rows: unknown[][] | null,
  result: CoachesResult,
  noteFor: ((c: Coach) => string) | null = null
): [string[], Array<[string[], string]>] {
  let headerI: number | null = null;
  let cols: Record<string, number> = {};
  if (rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const c: Record<string, number> = {};
      (rows[i] || []).forEach((v, j) => {
        const h = rc._hdr(v);
        if (h && !(h in c)) c[h] = j;
      });
      if (rc._find_col(c, ['name', 'full name', 'person', 'staff']) !== null &&
          rc._find_col(c, ['role', 'position', 'job']) !== null) {
        headerI = i;
        cols = c;
        break;
      }
    }
  }
  let headers: string[];
  let body: string[][];
  if (headerI === null || !rows) {
    headers = [...UPDATE_STANDARD_HEADERS];
    body = [];
    cols = Object.fromEntries(headers.map((h, j) => [h.toLowerCase(), j]));
  } else {
    const width = Math.max(...rows.map((r) => (r || []).length));
    headers = Array.from({ length: width }, (_, j) => cellText((rows[headerI as number] || [])[j]));
    while (headers.length && !headers[headers.length - 1]) headers.pop();
    body = rows.slice(headerI + 1)
      .map((r) => headers.map((_, j) => cellText((r || [])[j])))
      .filter((r) => r.some((v) => v.trim()));
  }
  const nameI = rc._find_col(cols, ['name', 'full name', 'person', 'staff']) as number;
  const roleI = rc._find_col(cols, ['role', 'position', 'job']) as number;
  let teamI = rc._find_col(cols, rc.TEAM_HEADERS);
  const secondI = rc._find_col(cols, ['second role', 'other role', 'additional role', 'role 2', 'also']);
  if (teamI === null) {
    headers.push('Team(s)');
    teamI = headers.length - 1;
    body = body.map((r) => [...r, '']);
  }
  // FAN, FA teams and roles, Notes and Changes: the file's own column when it has one, else a new one at the end
  const lower = headers.map((h) => h.trim().toLowerCase());
  const aliases: Record<string, string[]> = { Notes: ['notes', 'note', 'comments', 'comment'], FAN: ['fan', 'fan id', 'fan number'] };
  const extra: Record<string, number> = {};
  for (const h of UPDATE_EXTRA_HEADERS) {
    const names = aliases[h] || [h.toLowerCase()];
    let found = lower.findIndex((x) => names.includes(x));
    if (found < 0) {
      headers.push(h);
      found = headers.length - 1;
    }
    extra[h] = found;
  }
  const [fanC, rolesC, noteC, changeC] = UPDATE_EXTRA_HEADERS.map((h) => extra[h]);
  const out: Array<[string[], string]> = [];
  const matched = new Set<Coach>();
  for (const r0 of body) {
    const r = [...r0, ...Array(Math.max(0, headers.length - r0.length)).fill('')];
    const name = r[nameI].trim();
    const roles = [r[roleI], secondI !== null ? r[secondI] : ''].filter(Boolean);
    const coach = name ? result.coaches.find((c) => !matched.has(c) && same_person(c.name, name)) : undefined;
    let status = '';
    const changes: string[] = [];
    if (coach) {
      matched.add(coach);
      const current = rc._split_list(r[teamI]);
      const missing = coach.teams.filter((t) => !current.some((x) => same_team(t, x)));
      if (missing.length) {
        r[teamI] = [...current, ...missing].join(', ');
        changes.push('Added FA team(s): ' + missing.join(', '));
      }
      if (coach.name.trim().toLowerCase() !== name.toLowerCase()) changes.push(`FA name: ${coach.name}`);
      const notOnFa = current.filter((t) => covers_team(result, t) && !coach.teams.some((x) => same_team(t, x)));
      if (notOnFa.length) changes.push(`Not on ${notOnFa.join(', ')} in the FA report`);
      r[fanC] = coach.fan;
      r[rolesC] = fa_roles_text(coach);
      if (noteFor && noteFor(coach)) r[noteC] = noteFor(coach);
      status = missing.length ? UPDATED : '';
    } else if (name && roles.some(isTeamRole) && rc._split_list(r[teamI]).length) {
      status = NOT_IN_FA;
      changes.push('Not in the FA report as a team official');
    }
    r[changeC] = changes.join('; ');
    out.push([r, status]);
  }
  for (const c of result.coaches) {
    if (matched.has(c)) continue;
    const r = headers.map(() => '');
    r[nameI] = c.name;
    r[roleI] = mainRole(c);
    r[teamI] = c.teams.join(', ');
    r[fanC] = c.fan;
    r[rolesC] = fa_roles_text(c);
    r[changeC] = 'Added from the FA report';
    if (noteFor) r[noteC] = noteFor(c);
    out.push([r, ADDED]);
  }
  return [headers, out];
}

// --------------------------------------------------------------------------- WhatsApp reminder

export const REMINDER_BANDS = [EXPIRED, NOT_HELD, M1, M3, M6];
/** What the coach needs to do: placeholder text for the sender to fill in before sending. */
export const TO_DO: Record<CertKey, string> = {
  first_aid: '[What to do: e.g. book the FA Introduction to First Aid in Football course - add the link or date]',
  safeguarding: '[What to do: e.g. complete the FA Safeguarding Children course online - add the link]',
  dbs: '[What to do: e.g. start your FA DBS renewal - add who to contact or the link]',
};

/** True when First Aid, Safeguarding or DBS has expired, is not held or expires within 6 months. */
export function needs_reminder(c: Coach, today: rc.LocalDate = rc.todayLocalDate()): boolean {
  return CERTS.some(([k]) => REMINDER_BANDS.includes(cert_window(c.certs[k], today)));
}

/** WhatsApp text for a coach: what has expired or is expiring, then placeholder steps to fill in. */
export function reminder_message(
  c: Coach,
  today: rc.LocalDate = rc.todayLocalDate(),
  club = 'Wilpshire Wanderers FC'
): string {
  const due = CERTS.map(([k, label]) => [k, label, cert_window(c.certs[k], today)] as [CertKey, string, string])
    .filter(([, , band]) => REMINDER_BANDS.includes(band))
    .sort((a, b) => REMINDER_BANDS.indexOf(a[2]) - REMINDER_BANDS.indexOf(b[2]));
  const first = c.name.split(/\s+/).filter(Boolean)[0] || c.name;
  const teams = c.teams.length ? ` (${c.teams.join(', ')})` : '';
  const lines = [`Hi ${first}, this is a reminder from ${club} about your FA team official qualifications${teams}.`, ''];
  for (const [key, label, band] of due) {
    if (band === EXPIRED) lines.push(`- ${label}: expired`);
    else if (band === NOT_HELD) lines.push(`- ${label}: not on your FA record`);
    else lines.push(`- ${label}: expires ${cert_text(c.certs[key])} (${band.toLowerCase()})`);
  }
  lines.push('', 'What you need to do:');
  for (const [key, label] of due) lines.push(`- ${label}: ${TO_DO[key]}`);
  lines.push('', 'Please let me know once it is done. Thank you!');
  return lines.join('\n');
}

// --------------------------------------------------------------------------- views

export const COACH_HEADERS = ['Name', 'Team(s)', 'Role(s)', 'Coaching qualification', 'First Aid', 'Safeguarding',
  'DBS', 'Next action', 'Officials file'];

export const FILTERS = ['All coaches', 'Expired or not held', 'Expires within 1 month', 'Expires in 1 to 3 months',
  'Expires in 3 to 6 months', 'Expires in 6 months or more', 'Not in the officials file'];
const FILTER_WINDOWS: Record<string, string[]> = {
  [FILTERS[1]]: [EXPIRED, NOT_HELD], [FILTERS[2]]: [M1], [FILTERS[3]]: [M3], [FILTERS[4]]: [M6],
};

/** ['DBS expired', window] for the most urgent of the three, or ['', OK]. */
export function next_action(c: Coach, today: rc.LocalDate): [string, string] {
  const order = [EXPIRED, NOT_HELD, M1, M3, M6];
  let best: [CertKey, string, string] | null = null;
  for (const [key, label] of CERTS) {
    const w = cert_window(c.certs[key], today);
    if (order.includes(w) && (!best || order.indexOf(w) < order.indexOf(best[2]))) best = [key, label, w];
  }
  if (!best) return ['', OK];
  const [key, label, w] = best;
  if (w === EXPIRED) return [`${label} expired`, w];
  if (w === NOT_HELD) return [`${label} not held`, w];
  return [`${label} expires ${cert_text(c.certs[key])} (${w.toLowerCase()})`, w];
}

/** A coach is in a band when any of their three certificates is in it; '6 months or more' means all three. */
export function coach_matches(c: Coach, filt: string, today: rc.LocalDate): boolean {
  const windows = CERTS.map(([k]) => cert_window(c.certs[k], today));
  if (filt in FILTER_WINDOWS) return windows.some((w) => FILTER_WINDOWS[filt].includes(w));
  if (filt === FILTERS[5]) return windows.every((w) => w === OK);
  if (filt.startsWith('Not in')) return c.note === 'Not in the officials file';
  return true;
}

export function cert_cell(cert: Cert, today: rc.LocalDate): string {
  const w = cert_window(cert, today);
  const text = cert_text(cert);
  return [EXPIRED, NOT_HELD, UNKNOWN].includes(w) ? text : `${text} (${w.toLowerCase()})`;
}

/** [headers, [values, band]] where band is the coach's most urgent band (see WINDOW_COLOURS). */
export function coach_rows(
  result: CoachesResult,
  filt: string = FILTERS[0],
  today: rc.LocalDate = rc.todayLocalDate()
): [string[], Array<[string[], string]>] {
  const rows: Array<[string[], string]> = [];
  for (const c of result.coaches) {
    if (!coach_matches(c, filt, today)) continue;
    const [action, band] = next_action(c, today);
    let official = result.officials_checked ? c.official || 'No' : '';
    if (result.officials_checked && c.note && c.note !== 'Not in the officials file') {
      official = `${c.official}: ${c.note}`;
    }
    rows.push([
      [c.name, c.teams.join(', '), c.roles.join(', '), c.coaching || 'None recorded',
        ...CERTS.map(([k]) => cert_cell(c.certs[k], today)), action || 'None', official],
      band,
    ]);
  }
  return [COACH_HEADERS, rows];
}

/** Window -> [coach, teams, certificate, expiry text] for Expired, Not held and each expiry window. */
export function expiry_lists(
  result: CoachesResult,
  today: rc.LocalDate = rc.todayLocalDate()
): Record<string, Array<[string, string, string, string]>> {
  const out: Record<string, Array<[string, string, string, string]>> = {
    [EXPIRED]: [], [NOT_HELD]: [], [M1]: [], [M3]: [], [M6]: [],
  };
  for (const c of result.coaches) {
    for (const [key, label] of CERTS) {
      const w = cert_window(c.certs[key], today);
      if (w in out) out[w].push([c.name, c.teams.join(', '), label, cert_text(c.certs[key])]);
    }
  }
  return out;
}

export function coaches_totals(
  result: CoachesResult,
  today: rc.LocalDate = rc.todayLocalDate()
): Array<[string, number]> {
  const lists = expiry_lists(result, today);
  const people = (...windows: string[]) => new Set(windows.flatMap((w) => lists[w].map(([n]) => n))).size;
  const out: Array<[string, number]> = [
    ['Coaches and team officials in the FA report', result.coaches.length],
    ['Teams without a qualified coach/manager (FA: Incomplete)',
      result.teams.filter((t) => t.complete.toLowerCase() === 'incomplete').length],
    ['Expired', people(EXPIRED)],
    ['Not held', people(NOT_HELD)],
    ['Expires within 1 month', people(M1)],
    ['Expires in 1 to 3 months', people(M3)],
    ['Expires in 3 to 6 months', people(M6)],
    ['All three in date for 6 months or more',
      result.coaches.filter((c) => CERTS.every(([k]) => cert_window(c.certs[k], today) === OK)).length],
  ];
  if (result.officials_checked) {
    out.push(
      ['In the FA report but not the officials file',
        result.coaches.filter((c) => c.note === 'Not in the officials file').length],
      ['In the officials file with a team role but not the FA report', result.not_in_fa.length]
    );
  }
  return out;
}
