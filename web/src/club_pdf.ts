/// <reference types="vite/client" />
/**
 * Club teams PDF: every team with its coaches and players, and whether each player is in the FA, in Thrive and
 * paying. Laid out on the WWFC document template (club badge, name and Accredited Club logo in the header;
 * issue, page and date details in the footer). Built in the browser with pdf-lib: nothing is sent anywhere.
 * Mirrors src/club_pdf.py (web-only module, so it is not part of the reconcile_core parity tests).
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, RGB } from 'pdf-lib';
import badgeUrl from './assets/club_badge.jpg?inline';
import accreditedUrl from './assets/accredited_club.png?inline';
import * as rc from './reconcile_core';

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

export interface TeamSummary {
  label: string;
  staff: Array<[string, string]>; // [role, name]
  players: string[][]; // PDF_HEADERS values
  in_fa: number;
  in_thrive: number;
  paying: number;
  not_paying: number;
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

function surnameKey(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return `${(parts[parts.length - 1] || '').toLowerCase()}\u0000${name.toLowerCase()}`;
}

/** One TeamSummary per team, in age-group order, players sorted by surname. */
export function club_summary(result: rc.Result, today?: rc.LocalDate): TeamSummary[] {
  const day = today ?? rc.todayLocalDate();
  const out: TeamSummary[] = [];
  for (const label of rc.team_labels(result)) {
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
    for (const [source, row] of result.teams[label] || []) {
      const [name, , age] = rc._name_dob(row, day);
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

  /** A table with a blue header row, repeated on each new page. fill(row, col) gives a cell background. */
  table(header: string[], rows: string[][], fractions: number[], fill: (r: number, c: number) => RGB | null): void {
    const size = 10;
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

function chrome(page: PDFPage, f: Fonts, badge: PDFImage, accredited: PDFImage, n: number, total: number,
  now: Date, issue: string): void {
  const [width, height] = A4;
  const top = height - 1.25 * CM; // header distance 708 twips
  page.drawImage(badge, { x: MARGIN - 0.85 * CM, y: top - 1.9 * CM, width: 1.95 * CM, height: 1.84 * CM });
  page.drawImage(accredited, { x: MARGIN + 13.7 * CM, y: top - 2.07 * CM, width: 3.94 * CM, height: 2.07 * CM });
  const x = MARGIN + 1.3 * CM;
  page.drawText(CLUB_NAME, { x, y: top - 0.75 * CM, size: 21, font: f.regular }); // Helvetica runs wider than Calibri
  page.drawText(CLUB_LINES[0], { x, y: top - 1.3 * CM, size: 11, font: f.italic });
  page.drawText(CLUB_LINES[1], { x, y: top - 1.8 * CM, size: 11, font: f.italic });
  const y1 = 1.75 * CM;
  const y2 = 1.25 * CM;
  const right = (s: string, y: number, font = f.regular, size = 11) =>
    page.drawText(s, { x: width - MARGIN - font.widthOfTextAtSize(s, size), y, size, font });
  const centre = (s: string, y: number, font = f.regular, size = 11, color = BLACK) =>
    page.drawText(s, { x: (width - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color });
  page.drawText(`Issue: ${issue}`, { x: MARGIN, y: y1, size: 11, font: f.regular });
  centre(`Page: ${n} of ${total}`, y1);
  right(`Issue Date: ${ukDate(now)}`, y1);
  page.drawText(`Doc: ${DOC_REF}`, { x: MARGIN, y: y2, size: 11, font: f.regular });
  right(`Generated: ${ukDate(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`, y2);
  centre(CONFIDENTIAL, y2 - 0.5 * CM, f.bold, 8, RED);
}

/** The teams PDF as bytes, ready to download. */
export async function buildClubPdf(result: rc.Result, now: Date = new Date(), issue = '1.0'): Promise<Uint8Array> {
  const today = rc.makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const teams = club_summary(result, today);
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
  const badge = await doc.embedJpg(dataUrlBytes(badgeUrl));
  const accredited = await doc.embedPng(dataUrlBytes(accreditedUrl));
  const w = new Writer(doc, f);

  w.text(DOC_TITLE, 18, f.bold, HEAD, 4);
  w.text(
    `Every team with its coaches and players, from the FA and Thrive exports, ${now.getDate()} ` +
      `${MONTHS[now.getMonth()]} ${now.getFullYear()}.`, 10.5, f.regular);
  if (!result.fa_checked) {
    w.text('No FA report was loaded for this run, so FA registration was not checked.', 10.5, f.regular);
  }
  const total = teams.reduce((n, t) => n + t.players.length, 0);
  const paying = teams.reduce((n, t) => n + t.paying, 0);
  const notPaying = teams.reduce((n, t) => n + t.not_paying, 0);
  w.text(`${teams.length} teams, ${total} player places, ${paying} paying through Thrive, ${notPaying} not paying.`,
    10.5, f.bold, BLACK, 8);
  const summary = teams.map((t) => [
    t.label,
    t.staff.filter(([role]) => role === 'Manager').map(([, n]) => n).join(', ') || '-',
    String(t.players.length),
    result.fa_checked ? String(t.in_fa) : '-',
    String(t.in_thrive),
    String(t.paying),
    String(t.not_paying),
  ]);
  w.table(['Team', 'Manager(s)', 'Players', 'In FA', 'In Thrive', 'Paying', 'Not paying'], summary,
    [0.22, 0.28, 0.1, 0.09, 0.11, 0.1, 0.1],
    (r, c) => (c === 6 ? (teams[r].not_paying ? BAD : GOOD) : r % 2 === 1 ? STRIPE : null));
  w.text(PDF_NOTE, 9, f.regular, GREY);
  if (result.staff_issues.length) {
    w.text('Managers file notes: ' + result.staff_issues.join('; '), 9, f.regular, GREY);
  }

  for (const t of teams) {
    w.newPage();
    w.text(t.label, 14, f.bold, HEAD, 2);
    const staff = t.staff.map(([role, name]) => `${role}: ${name}`).join('; ') ||
      'No coaches listed (add a managers file)';
    w.text(`Coaches: ${staff}`, 10.5, f.regular, BLACK, 2);
    w.text(`${t.players.length} players: ${t.in_fa} in FA, ${t.in_thrive} in Thrive, ${t.paying} paying, ` +
      `${t.not_paying} not paying.`, 9, f.regular, GREY, 6);
    if (!t.players.length) {
      w.text('No players.', 10.5, f.regular);
      continue;
    }
    w.table(PDF_HEADERS, t.players, [0.4, 0.08, 0.2, 0.14, 0.18], (r, c) => {
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

  w.pages.forEach((page, i) => chrome(page, f, badge, accredited, i + 1, w.pages.length, now, issue));
  return doc.save();
}
