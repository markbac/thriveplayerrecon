/// <reference types="vite/client" />
/**
 * Club teams PDF: every team with its coaches and players, and whether each player is in the FA, in Thrive and
 * paying. Laid out on the WWFC document template: the app's club logo, the club name and the Accredited Club /
 * Lancashire FA badges in the header; the generated date and time and page number in the footer. Built in the browser with pdf-lib: nothing is sent anywhere.
 * Mirrors src/club_pdf.py (web-only module, so it is not part of the reconcile_core parity tests).
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, RGB } from 'pdf-lib';
import logoUrl from './assets/club_logo.png?inline';
import badgesUrl from './assets/fa_badges.png?inline';
import * as rc from './reconcile_core';
import * as co from './coaches';

export const CLUB_NAME = 'Wilpshire Wanderers Football Club';
export const CLUB_LINES = ['Established 1997', 'Promoting a team Spirit'];
export const DOC_TITLE = 'Teams, coaches and players';
export const DOC_REF = 'Team and player summary';
export const PDF_HEADERS = ['Player', 'Age', 'In FA', 'In Thrive', 'Paying'];
export const PDF_NOTE =
  "In FA: the player's FA registration status, 'No' when not found in the FA report. Paying: whether the " +
  'player has an active Thrive mandate. A player shown as not in Thrive may be there under a different ' +
  'name: check before chasing.';
export const CONFIDENTIAL =
  'CONFIDENTIAL: names children. Share only with those who need it and delete when finished.';
export const CONFIDENTIAL_ADULTS =
  'CONFIDENTIAL: personal data about club officials. Share only with those who need it and delete when finished.';

export interface TeamSummary {
  label: string;
  staff: Array<[string, string]>; // [role, name]
  players: string[][]; // PDF_HEADERS values
  in_fa: number;
  in_thrive: number;
  paying: number;
  not_paying: number;
}

/** A person (or an unfilled role) from the club officials file or the managers file. */
export interface Official {
  name: string; // '' for a vacant role
  role: string;
  second_role: string;
  exec_member: boolean;
  teams: string[];
  phone?: string;
}

const rolesOf = (o: Official) => [o.role, o.second_role].filter(Boolean);
const AGE_ROLE = /^u0*(\d+)\s+(lead|head coach|manager|coach|assistant|asst)\b/i;

/** 'manager' or 'assistant' for a team role (Manager, Assistant manager, Coach, 'U5 Lead'), else null. */
function teamRole(role: string): 'manager' | 'assistant' | null {
  const r = role.toLowerCase();
  if (['assist', 'asst', 'deputy'].some((w) => r.includes(w))) return 'assistant';
  if (r.includes('manager') || r.includes('coach') || /\blead\b/.test(r)) return 'manager';
  return null;
}

const isYes = (v: string) => ['yes', 'y', 'true', 'x', '1', '\u2713', '\u2714'].includes(v.trim().toLowerCase());

/** People from a club officials file: Name, Role, and optionally Second role, Exec Member and Team(s). The existing
 * one-row-per-person managers file has the same Name / Role / Team(s) columns, so it works too. Rows with a role but
 * no name are kept as vacant roles. Returns [] for a one-row-per-team managers file. */
export function parse_officials(sheets: unknown[][][]): Official[] {
  for (const rows of sheets) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const cols: Record<string, number> = {};
      (rows[i] || []).forEach((c, j) => {
        const h = rc._hdr(c);
        if (h && !(h in cols)) cols[h] = j;
      });
      const nameI = rc._find_col(cols, ['name', 'full name', 'person', 'staff']);
      const roleI = rc._find_col(cols, ['role', 'position', 'job']);
      if (nameI === null || roleI === null) continue;
      const secondI = rc._find_col(cols, ['second role', 'other role', 'additional role', 'role 2', 'also']);
      const execI = rc._find_col(cols, ['exec member', 'exec', 'executive', 'executive member', 'committee',
        'exec committee', 'committee member']);
      const teamI = rc._find_col(cols, rc.TEAM_HEADERS);
      const phoneI = rc._find_col(cols, ['phone', 'mobile', 'telephone', 'tel', 'phone number', 'mobile number']);
      const out: Official[] = [];
      for (const r of rows.slice(i + 1)) {
        const name = rc._cell(r, nameI);
        let role = rc._cell(r, roleI);
        const second = secondI !== null ? rc._cell(r, secondI) : '';
        const teams = teamI !== null ? rc._split_list(rc._cell(r, teamI)) : [];
        if (!(name || role || second)) continue;
        if (name && !role && teams.length && !teamRole(second)) role = 'Manager'; // as the managers file reads it
        out.push({
          name, role, second_role: second, exec_member: execI !== null && isYes(rc._cell(r, execI)), teams,
          phone: phoneI !== null ? rc._cell(r, phoneI) : '',
        });
      }
      if (out.length) return out;
    }
  }
  return [];
}

/** Managers and assistants from the managers file already attached to the result (any layout). */
export function officials_from_staff(result: rc.Result): Official[] {
  const seen = new Map<string, Official>();
  for (const label of rc.team_labels(result)) {
    for (const p of result.staff[label] || []) {
      const key = `${p.name.toLowerCase()}\u0000${p.role.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, { name: p.name, role: p.role, second_role: '', exec_member: false, teams: [], phone: p.phone });
      }
      seen.get(key)!.teams.push(label);
    }
  }
  return [...seen.values()];
}

export interface OfficialsSummary {
  president: string[];
  executive: Array<[string, string, string]>; // [role, name or 'Vacant', also]
  teams: Array<[string, string[], string[]]>; // [team, managers, assistants]
  others: Array<[string, string, string]>;
}

const EXEC_ORDER = ['chair', 'vice', 'secretary', 'treasurer', 'welfare'];
function execRank(role: string): number {
  const r = role.toLowerCase();
  const i = EXEC_ORDER.findIndex((w) => r.includes(w) && !(w === 'chair' && r.includes('vice')));
  return i < 0 ? EXEC_ORDER.length : i;
}
const isPresident = (role: string) => /president/i.test(role) && !/vice/i.test(role);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The president, the executive committee, each team's managers and assistants, and anyone else. */
export function officials_summary(officials: Official[]): OfficialsSummary {
  const out: OfficialsSummary = { president: [], executive: [], teams: [], others: [] };
  const teams = new Map<string, [string, string[], string[]]>(); // team form -> [display, managers, assistants]
  const addTeam = (team: string, kind: 'manager' | 'assistant', name: string) => {
    const form = rc._team_form(team, '');
    if (!teams.has(form)) teams.set(form, [team, [], []]);
    const names = teams.get(form)![kind === 'manager' ? 1 : 2];
    if (!names.includes(name)) names.push(name);
  };
  for (const o of officials) {
    let clubRoles: string[] = [];
    for (const role of rolesOf(o)) {
      const age = AGE_ROLE.exec(role);
      const kind = teamRole(role);
      if (age) {
        if (o.name) addTeam(`U${Number(age[1])}`, kind ?? 'manager', o.name);
      } else if (kind) {
        if (o.name) for (const team of o.teams) addTeam(team, kind, o.name);
      } else {
        clubRoles.push(role);
      }
    }
    if (o.name && clubRoles.some(isPresident)) {
      out.president.push(o.name);
      clubRoles = clubRoles.filter((r) => !isPresident(r));
    }
    if (!clubRoles.length) continue;
    const also = rolesOf(o)
      .filter((r) => !clubRoles.includes(r))
      .map((r) => r + (teamRole(r) && !AGE_ROLE.test(r) && o.teams.length ? ` (${o.teams.join(', ')})` : ''))
      .join(', ');
    const entry: [string, string, string] = [clubRoles.join(' / '), o.name || 'Vacant', also];
    (o.exec_member ? out.executive : out.others).push(entry);
  }
  out.executive.sort((a, b) => Number(a[1] === 'Vacant') - Number(b[1] === 'Vacant') ||
    execRank(a[0]) - execRank(b[0]) || cmp(a[0].toLowerCase(), b[0].toLowerCase()));
  out.others.sort((a, b) => cmp(a[0].toLowerCase(), b[0].toLowerCase()));
  const teamKey = (form: string) => rc._team_age_limit(teams.get(form)![0]) ?? 999;
  out.teams = [...teams.keys()]
    .sort((a, b) => teamKey(a) - teamKey(b) || cmp(a, b))
    .map((f) => teams.get(f)!);
  return out;
}

/** Counts for the summary page: people, executive roles (and how many are vacant), managers, assistants. */
export function officials_totals(officials: Official[]): Array<[string, number]> {
  const summary = officials_summary(officials);
  const people = new Set(officials.filter((o) => o.name.trim()).map((o) => o.name.trim().toLowerCase()));
  const managers = new Set(summary.teams.flatMap(([, m]) => m));
  const assistants = new Set(summary.teams.flatMap(([, , a]) => a));
  const out: Array<[string, number]> = [['Club officials (people)', people.size]];
  if (summary.executive.length) {
    out.push(['Executive committee roles', summary.executive.length]);
    const vacant = summary.executive.filter(([, n]) => n === 'Vacant').length;
    if (vacant) out.push(['Executive committee roles vacant', vacant]);
  }
  out.push(['Managers and team leads', managers.size], ['Assistant managers', assistants.size]);
  return out;
}

/** Leads and assistants named by age group in the officials file ('U5 Lead') for a U4-U6 team. */
function ageGroupStaff(officials: Official[], label: string): Array<[string, string]> {
  const limit = rc._team_age_limit(label);
  const out: Array<[string, string]> = [];
  for (const o of officials) {
    for (const role of rolesOf(o)) {
      const m = AGE_ROLE.exec(role);
      if (o.name && m && Number(m[1]) === limit) out.push([role, o.name]);
    }
  }
  return out.sort((a, b) => Number(teamRole(a[0]) !== 'manager') - Number(teamRole(b[0]) !== 'manager'));
}

export function fa_cell(source: string, row: rc.Row): string {
  if (source === rc.NO_FA) return 'Not needed';
  if (source === rc.FA_NOT_CHECKED) return 'Not checked';
  if (row.fa === null) return 'No';
  return row.fa_status || 'Yes';
}

export function paying_cell(row: rc.Row): string {
  const status = rc.paying_status(row);
  if (status === 'Yes') return 'Yes';
  if (status.startsWith('No')) return 'No';
  return status.startsWith('Unknown') ? 'Unknown' : 'Not expected';
}

/** '4y 7m': age in whole years and months, used for the youngest groups (U4-U6). */
export function age_years_months(dob: rc.LocalDate, today: rc.LocalDate): string {
  const months = (today.year - dob.year) * 12 + today.month - dob.month - (today.day < dob.day ? 1 : 0);
  return `${Math.floor(months / 12)}y ${months % 12}m`;
}

function surnameKey(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return `${(parts[parts.length - 1] || '').toLowerCase()}\u0000${name.toLowerCase()}`;
}

/** One TeamSummary per team, in age-group order with training groups last, players sorted by surname. */
export function club_summary(result: rc.Result, today?: rc.LocalDate, officials: Official[] = []): TeamSummary[] {
  const day = today ?? rc.todayLocalDate();
  const out: TeamSummary[] = [];
  const labels = [...rc.team_labels(result)].sort((a, b) => Number(isTraining(a)) - Number(isTraining(b))); // stable
  for (const label of labels) {
    const t: TeamSummary = { label, staff: [], players: [], in_fa: 0, in_thrive: 0, paying: 0, not_paying: 0 };
    const people = result.staff[label] || [];
    const roles: Array<['manager' | 'assistant' | 'other', string]> = [
      ['manager', 'Manager'],
      ['assistant', 'Assistant manager'],
      ['other', 'Coach'],
    ];
    for (const [kind, title] of roles) {
      for (const p of people) {
        if (p.kind === kind && p.name.trim()) {
          t.staff.push([kind === 'other' && p.role.trim() ? p.role.trim() : title, p.name.trim()]);
        }
      }
    }
    if (officials.length && rc.no_fa_age_group(label)) {
      // 'U5 Lead' and similar in the officials file
      const named = new Set(t.staff.map(([, n]) => n));
      t.staff.push(...ageGroupStaff(officials, label).filter(([, n]) => !named.has(n)));
    }
    for (const [source, row] of result.teams[label] || []) {
      const [name, dob, years] = rc._name_dob(row, day);
      const age = dob && rc.no_fa_age_group(label) ? age_years_months(dob, day) : years;
      const fa = fa_cell(source, row);
      const paying = paying_cell(row);
      t.players.push([name, String(age), fa, row.th ? 'Yes' : 'No', paying]);
      if (row.fa) t.in_fa++;
      if (row.th) t.in_thrive++;
      if (paying === 'Yes') t.paying++;
      if (paying === 'No') t.not_paying++;
    }
    t.players.sort((a, b) => (surnameKey(a[0]) < surnameKey(b[0]) ? -1 : surnameKey(a[0]) > surnameKey(b[0]) ? 1 : 0));
    out.push(t);
  }
  return out;
}

const isTraining = (label: string) => label.toLowerCase().includes('training');

/** Club-wide counts with each player counted once, even when they play in two teams (Saturday and Sunday).
 * The players split into U4 to U6, U7 and over in a team, and U7 and over in training groups only, which add up to
 * the club total. Training groups are not teams: they do not count as a second team or as team places. */
export function club_totals(result: rc.Result): Array<[string, number]> {
  const teamsOf = new Map<rc.Row, Set<string>>();
  for (const [label, members] of Object.entries(result.teams)) {
    for (const [, row] of members) {
      if (!teamsOf.has(row)) teamsOf.set(row, new Set());
      teamsOf.get(row)!.add(label);
    }
  }
  const rows = [...teamsOf.keys()];
  const paying = rows.map(paying_cell);
  const count = (v: string) => paying.filter((p) => p === v).length;
  // U4 to U6, U7 and over in a team, U7 and over in training groups only: these add up to the club total
  let young = 0;
  let inTeam = 0;
  let trainingOnly = 0;
  for (const labels of teamsOf.values()) {
    const list = [...labels];
    if (list.some((x) => rc.no_fa_age_group(x))) young++;
    else if (list.some((x) => !isTraining(x))) inTeam++;
    else trainingOnly++;
  }
  const out: Array<[string, number]> = [
    ['Players in the club (each counted once)', rows.length],
    ['Of these, U4 to U6', young],
    ['Of these, U7 and over in a team', inTeam],
    ['Of these, U7 and over in training groups only', trainingOnly],
    [
      'Playing in two or more teams (e.g. Saturday and Sunday)',
      [...teamsOf.values()].filter((labels) => [...labels].filter((x) => !isTraining(x)).length > 1).length,
    ],
    [
      'Team places (a player in two teams counts twice; training groups not counted)',
      Object.entries(result.teams).filter(([label]) => !isTraining(label)).reduce((n, [, m]) => n + m.length, 0),
    ],
  ];
  if (result.fa_checked) out.push(['In the FA report', rows.filter((r) => r.fa !== null).length]);
  out.push(
    ['In Thrive', rows.filter((r) => r.th !== null).length],
    ['Paying through Thrive', count('Yes')],
    ['Not paying', count('No')]
  );
  if (count('Unknown')) out.push(['Paying not known (no mandate column in the Thrive export)', count('Unknown')]);
  return out;
}

// --------------------------------------------------------------------------- drawing

const CM = 72 / 2.54;
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 2.54 * CM; // the template's 1 inch margins
const hex = (h: string): RGB =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const HEAD = hex('#1F3A93');
const GOOD = hex('#E2F0D9');
const BAD = hex('#FFC7CE');
const WARN = hex('#FFF2CC');
const STRIPE = hex('#F2F2F2');
const LINE = hex('#A6A6A6');
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);
const GREY = hex('#444444');
const RED = hex('#C00000');

function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const ukDate = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

/** The standard PDF fonts only cover Windows-1252: replace anything else so an unusual name cannot fail the export. */
function safe(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      try {
        font.encodeText(plain);
        out += plain;
      } catch {
        out += '?';
      }
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of safe(font, text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const trial = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) <= width || !line) {
        line = trial;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  readonly top = A4[1] - MARGIN - 1.3 * CM;
  readonly bottom = MARGIN;
  readonly width = A4[0] - 2 * MARGIN;

  constructor(private doc: PDFDocument, private f: Fonts) {
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = this.top;
  }

  text(text: string, size: number, font: PDFFont, color: RGB = BLACK, gapAfter = 4): void {
    const leading = size * 1.28;
    for (const line of wrap(font, text, size, this.width)) {
      if (this.y - leading < this.bottom) this.newPage();
      this.y -= leading;
      this.page.drawText(line, { x: MARGIN, y: this.y + size * 0.25, size, font, color });
    }
    this.y -= gapAfter;
  }

  /** One row of coloured, labelled boxes explaining the colours. */
  legend(labels: string[], colours: Record<string, RGB | null>): void {
    const size = 8;
    const h = size * 1.2 + 8;
    if (this.y - h < this.bottom) this.newPage();
    const width = this.width / labels.length;
    labels.forEach((label, i) => {
      const x = MARGIN + i * width;
      this.page.drawRectangle({ x, y: this.y - h, width, height: h, color: colours[label] ?? undefined,
        borderColor: LINE, borderWidth: 0.5 });
      const text = safe(this.f.regular, label);
      this.page.drawText(text, { x: x + (width - this.f.regular.widthOfTextAtSize(text, size)) / 2,
        y: this.y - h / 2 - size * 0.35, size, font: this.f.regular, color: BLACK });
    });
    this.y -= h + 4;
  }

  /** A table with a blue header row, repeated on each new page. fill(row, col) gives a cell background. */
  table(
    header: string[],
    rows: string[][],
    fractions: number[],
    fill: (r: number, c: number) => RGB | null,
    size = 10
  ): void {
    const widths = fractions.map((f) => f * this.width);
    const rowHeight = (cells: string[], font: PDFFont) =>
      Math.max(...cells.map((v, i) => wrap(font, v, size, widths[i] - 8).length)) * size * 1.2 + 7;
    const draw = (cells: string[], header_: boolean, r: number) => {
      const font = header_ ? this.f.bold : this.f.regular;
      const h = rowHeight(cells, font);
      let x = MARGIN;
      cells.forEach((v, c) => {
        const bg = header_ ? HEAD : fill(r, c);
        this.page.drawRectangle({
          x, y: this.y - h, width: widths[c], height: h,
          color: bg ?? undefined, borderColor: LINE, borderWidth: 0.5,
        });
        const lines = wrap(font, v, size, widths[c] - 8);
        const block = lines.length * size * 1.2;
        lines.forEach((line, i) => {
          this.page.drawText(line, {
            x: x + 4, y: this.y - (h - block) / 2 - size * 0.95 - i * size * 1.2, size, font,
            color: header_ ? WHITE : BLACK,
          });
        });
        x += widths[c];
      });
      this.y -= h;
    };
    const headerHeight = rowHeight(header, this.f.bold);
    if (this.y - headerHeight - 20 < this.bottom) this.newPage();
    draw(header, true, -1);
    rows.forEach((cells, r) => {
      if (this.y - rowHeight(cells, this.f.regular) < this.bottom) {
        this.newPage();
        draw(header, true, -1);
      }
      draw(cells, false, r);
    });
    this.y -= 8;
  }
}

function chrome(page: PDFPage, f: Fonts, logo: PDFImage, badges: PDFImage, n: number, total: number,
  now: Date): void {
  const [width, height] = A4;
  const top = height - 1.25 * CM; // header distance 708 twips
  // the app's club logo left (pulled into the margin as in the template), FA badges right
  page.drawImage(logo, { x: MARGIN - 0.85 * CM, y: top - 1.95 * CM, width: 1.95 * CM, height: 1.95 * CM });
  const badgesH = 2.05 * CM;
  const badgesW = (badgesH * badges.width) / badges.height;
  page.drawImage(badges, { x: width - MARGIN + 1.0 * CM - badgesW, y: top - badgesH, width: badgesW, height: badgesH });
  const x = MARGIN + 1.3 * CM;
  page.drawText(CLUB_NAME, { x, y: top - 0.75 * CM, size: 21, font: f.regular }); // Helvetica runs wider than Calibri
  page.drawText(CLUB_LINES[0], { x, y: top - 1.3 * CM, size: 11, font: f.italic });
  page.drawText(CLUB_LINES[1], { x, y: top - 1.8 * CM, size: 11, font: f.italic });
  // footer: when it was generated, and the page number
  const y = 1.25 * CM;
  page.drawText(`Generated: ${ukDate(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    { x: MARGIN, y, size: 10, font: f.regular });
  const pageText = `Page ${n} of ${total}`;
  page.drawText(pageText, { x: width - MARGIN - f.regular.widthOfTextAtSize(pageText, 10), y, size: 10, font: f.regular });
}

/** The teams PDF as bytes, ready to download. */
/** The club PDF as bytes: the summary, club officials, coaches' qualifications (with the FA Team Qualifications
 * Report) and a page per team (with the player files). result is null for a coaches-only run. */
export async function buildClubPdf(
  result: rc.Result | null,
  now: Date = new Date(),
  officialsIn: Official[] = [],
  coaches: co.CoachesResult | null = null
): Promise<Uint8Array> {
  const officials = officialsIn.length ? officialsIn : result ? officials_from_staff(result) : [];
  const today = rc.makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const teams = result ? club_summary(result, today, officials) : [];
  const doc = await PDFDocument.create();
  doc.setTitle(`${CLUB_NAME}: ${DOC_TITLE}`);
  doc.setAuthor(CLUB_NAME);
  doc.setSubject(DOC_REF);
  doc.setCreator(`${rc.APP_TITLE} ${rc.VERSION}`);
  doc.setProducer(`${rc.APP_TITLE} ${rc.VERSION}`);
  const f: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const logo = await doc.embedPng(dataUrlBytes(logoUrl));
  const badges = await doc.embedPng(dataUrlBytes(badgesUrl));
  const w = new Writer(doc, f);

  const dateText = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  if (result) {
    w.text(DOC_TITLE, 18, f.bold, HEAD, 4);
    w.text(`Every team with its coaches and players, from the FA and Thrive exports, ${dateText}.`, 10.5, f.regular);
    if (!result.fa_checked) {
      w.text('No FA report was loaded for this run, so FA registration was not checked.', 10.5, f.regular);
    }
  } else {
    w.text('Club officials and coaches', 18, f.bold, HEAD, 4);
    w.text(`From the FA Team Qualifications Report and the club officials file, ${dateText}.`, 10.5, f.regular);
  }
  w.y -= 4;
  // one summary block: a table per part, joined together
  const sections: Array<[string, Array<[string, number]>]> = [];
  if (result) sections.push(['Club summary', club_totals(result)]);
  if (officials.length) sections.push(['Club officials', officials_totals(officials)]);
  if (coaches) sections.push(['Coaches (FA Team Qualifications Report)', co.coaches_totals(coaches, today)]);
  sections.forEach(([title, items], i) => {
    if (i > 0) w.y += 8; // joined to the table above
    w.table([title, ''], items.map(([name, n]) => [name, String(n)]), [0.72, 0.14],
      (_r, c) => (c === 1 ? STRIPE : null));
  });
  if (result) {
    w.newPage();
    w.text(`Squads (${teams.length})`, 18, f.bold, HEAD, 4);
    const summary = teams.map((t) => [
      t.label,
      t.staff.filter(([role]) => teamRole(role) === 'manager').map(([, n]) => n).join(', ') || '-',
      String(t.players.length),
      result.fa_checked ? String(t.in_fa) : '-',
      String(t.in_thrive),
      String(t.paying),
      String(t.not_paying),
    ]);
    w.table(['Squad', 'Manager(s)', 'Players', 'In FA', 'In Thrive', 'Paying', 'Not paying'], summary,
      [0.22, 0.28, 0.1, 0.09, 0.11, 0.1, 0.1],
      (r, c) => (c === 6 ? (teams[r].not_paying ? BAD : GOOD) : r % 2 === 1 ? STRIPE : null));
    w.text(PDF_NOTE, 9, f.regular, GREY);
    w.text(CONFIDENTIAL, 9, f.bold, RED);
  } else {
    w.text(CONFIDENTIAL_ADULTS, 9, f.bold, RED);
  }

  if (officials.length) {
    // club officials page: president, executive committee, managers and assistants
    const summary = officials_summary(officials);
    w.newPage();
    w.text('Club officials', 18, f.bold, HEAD, 4);
    if (summary.president.length) w.text(`Club President: ${summary.president.join(', ')}`, 10.5, f.bold, BLACK, 8);
    if (summary.executive.length) {
      w.text('Executive committee', 14, f.bold, HEAD, 2);
      w.table(['Role', 'Name', 'Also'], summary.executive.map((e) => [...e]), [0.4, 0.25, 0.35],
        (r, c) => (c === 1 && summary.executive[r][1] === 'Vacant' ? WARN : null));
    }
    if (summary.teams.length) {
      w.text('Managers and assistants', 14, f.bold, HEAD, 2);
      w.table(['Team', 'Manager / lead', 'Assistant(s)'],
        summary.teams.map(([team, m, a]) => [team, m.join(', ') || '-', a.join(', ') || '-']), [0.26, 0.37, 0.37],
        (r) => (r % 2 === 1 ? STRIPE : null));
    }
    if (summary.others.length) {
      w.text('Other club roles', 14, f.bold, HEAD, 2);
      w.table(['Role', 'Name', 'Also'], summary.others.map((e) => [...e]), [0.4, 0.25, 0.35], () => null);
    }
  }

  if (coaches) {
    // coaches' qualifications: what needs doing, then every coach
    const windowColour: Record<string, RGB | null> = Object.fromEntries(
      Object.entries(co.WINDOW_COLOURS).map(([k, v]) => [k, hex(v)]));

    w.newPage();
    w.text("Coaches' qualifications", 18, f.bold, HEAD, 4);
    w.text(`From the FA Team Qualifications Report${coaches.report_date ? ' of ' + coaches.report_date : ''}. ` +
      `Expiry windows count from ${rc.formatDate(today)}.`, 10.5, f.regular, BLACK, 6);
    const incomplete = coaches.teams.filter((t) => t.complete.toLowerCase() === 'incomplete').map((t) => t.team);
    if (incomplete.length) {
      w.text(`Teams without a qualified coach/manager (FA: Incomplete): ${incomplete.join(', ')}`, 10.5, f.bold,
        BLACK, 6);
    }
    const lists = co.expiry_lists(coaches, today);
    const due = [co.EXPIRED, co.NOT_HELD, co.M1, co.M3, co.M6].flatMap((win) =>
      lists[win].map((item) => [win, ...item]));
    w.text('Expired, not held and expiring in the next 6 months', 14, f.bold, HEAD, 2);
    if (due.length) {
      w.table(['When', 'Coach', 'Team(s)', 'Certificate', 'Expiry'], due, [0.17, 0.22, 0.27, 0.16, 0.18],
        (r, c) => (c === 0 ? windowColour[due[r][0]] : null));
    } else {
      w.text('Nothing expired, missing or expiring within 6 months.', 10.5, f.regular);
    }
    w.legend([co.EXPIRED, co.M1, co.M3, co.M6, co.OK, co.NOT_HELD], windowColour);
    w.text('Not held is not always required: the FA requires First Aid only for some roles.', 9, f.regular, GREY, 8);
    if (coaches.officials_checked) {
      w.text('Compared with the club officials file', 14, f.bold, HEAD, 2);
      const notInFile = coaches.coaches.filter((c) => c.note === 'Not in the officials file');
      const differs = coaches.coaches.filter((c) => c.note && c.note !== 'Not in the officials file');
      const items: string[] = [];
      if (notInFile.length) {
        items.push('In the FA report but not the officials file: ' +
          notInFile.map((c) => `${c.name} (${c.teams.join(', ')})`).join(', '));
      }
      if (coaches.not_in_fa.length) {
        items.push('In the officials file with a team role but not the FA report: ' +
          coaches.not_in_fa.map(([n, , t]) => `${n} (${t})`).join(', '));
      }
      for (const c of differs) items.push(`${c.name}: ${c.note}`);
      if (!items.length) items.push('Everyone matches.');
      for (const item of items) w.text(item, 10.5, f.regular, BLACK, 2);
      w.y -= 6;
    }
    w.text(`All coaches and team officials (${coaches.coaches.length})`, 14, f.bold, HEAD, 2);
    const all = coaches.coaches.map((c) => [c.name, c.teams.join(', '), c.roles.join(', '),
      c.coaching || 'None recorded', ...co.CERTS.map(([k]) => co.cert_text(c.certs[k]))]);
    w.table(['Name', 'Team(s)', 'Role(s)', 'Coaching qualification', 'First Aid', 'Safeguarding', 'DBS'], all,
      [0.17, 0.14, 0.13, 0.17, 0.13, 0.13, 0.13],
      (r, c) => (c >= 4 ? windowColour[co.cert_window(coaches.coaches[r].certs[co.CERTS[c - 4][0]], today)] : null),
      8.5);
    w.legend([co.EXPIRED, co.M1, co.M3, co.M6, co.OK, co.NOT_HELD], windowColour);
  }

  for (const t of teams) {
    w.newPage();
    w.text(t.label, 14, f.bold, HEAD, 2);
    w.text('Coaches:', 10.5, f.bold, BLACK, 0);
    t.staff.forEach(([role, name], i) => {
      w.text(`${role}: ${name}${i < t.staff.length - 1 ? ';' : ''}`, 10.5, f.regular, BLACK, 0);
    });
    if (!t.staff.length) w.text('No coaches listed (add a managers file)', 10.5, f.regular, BLACK, 0);
    w.y -= 2;
    w.text(`${t.players.length} player${t.players.length === 1 ? '' : 's'}: ${t.in_fa} in FA, ${t.in_thrive} in Thrive, ${t.paying} paying, ` +
      `${t.not_paying} not paying.`, 9, f.regular, GREY, 6);
    if (!t.players.length) {
      w.text('No players.', 10.5, f.regular);
      continue;
    }
    w.table(PDF_HEADERS, t.players, [0.37, 0.11, 0.2, 0.14, 0.18], (r, c) => {
      const v = t.players[r][c];
      if (c === 2) {
        if (v === 'No') return BAD;
        if (v.toLowerCase().startsWith('registered')) return GOOD;
        return v === 'Not needed' || v === 'Not checked' ? null : WARN;
      }
      if (c === 3) return v === 'Yes' ? GOOD : BAD;
      if (c === 4) return v === 'Yes' ? GOOD : v === 'No' ? BAD : v === 'Unknown' ? WARN : null;
      return null;
    });
  }

  w.pages.forEach((page, i) => chrome(page, f, logo, badges, i + 1, w.pages.length, now));
  return doc.save();
}
