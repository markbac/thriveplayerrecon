/**
 * File reading (Excel .xlsx and CSV) and styled Excel / Zip exports in the browser (and Node tests).
 * Matches the desktop openpyxl exports (Summary, Results tabs, Not paying, Missing consents, Team sheets,
 * Matchday sheet, Team mapping, and one-file-per-team Zip).
 */
import ExcelJS from 'exceljs';
import { zipSync } from 'fflate';
import * as rc from './reconcile_core';

function unwrapExcelValue(val: ExcelJS.CellValue): unknown {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val;
  if (typeof val === 'object') {
    if ('result' in val && val.result !== undefined) {
      return val.result instanceof Error ? '' : val.result;
    }
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((rt) => rt.text).join('');
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text;
    }
  }
  return val;
}

/**
 * Parse a CSV string (supporting quoted fields, commas, newlines, and UTF-8 BOM) into a 2D array of strings.
 */
export function parseCsv(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (cleaned[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Read an Excel (.xlsx) or CSV buffer into a list of worksheets, each as a list of row arrays.
 */
export async function readWorkbookSheets(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string
): Promise<unknown[][][]> {
  const base = (fileName.split(/[\\/]/).pop() || fileName).trim();
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const isZipXlsx =
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  const looksLikeCsvName = /\.csv(\s*\(\d+\))?$/i.test(base);

  if (!isZipXlsx && looksLikeCsvName) {
    try {
      const text = new TextDecoder('utf-8').decode(buffer);
      return [parseCsv(text)];
    } catch (exc) {
      throw new rc.ReportError(`Could not open ${base}: ${exc}`);
    }
  }

  const wb = new ExcelJS.Workbook();
  try {
    const ab =
      buffer instanceof Uint8Array
        ? (buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          ) as ArrayBuffer)
        : buffer;
    await wb.xlsx.load(ab);
  } catch (exc) {
    // Fallback: if a CSV file on mobile was renamed without a .csv extension, check if it is UTF-8 CSV text
    if (!isZipXlsx && bytes.byteLength > 0 && !bytes.subarray(0, 512).includes(0)) {
      try {
        const text = new TextDecoder('utf-8').decode(buffer);
        if (text.includes(',')) {
          return [parseCsv(text)];
        }
      } catch {
        // Fall through to ReportError below
      }
    }
    throw new rc.ReportError(`Could not open ${base}: ${exc}`);
  }
  const sheets: unknown[][][] = [];
  for (const ws of wb.worksheets) {
    const rows: unknown[][] = [];
    const rowCount = ws.rowCount;
    for (let r = 1; r <= rowCount; r++) {
      const rowObj = ws.getRow(r);
      const maxCol = rowObj.cellCount;
      const cells: unknown[] = [];
      for (let c = 1; c <= maxCol; c++) {
        cells.push(unwrapExcelValue(rowObj.getCell(c).value));
      }
      rows.push(cells);
    }
    sheets.push(rows);
  }
  return sheets;
}

export async function detect_kind(
  buffer: ArrayBuffer | Uint8Array,
  fileName = 'file.xlsx'
): Promise<'fa' | 'thrive' | null> {
  try {
    const sheets = await readWorkbookSheets(buffer, fileName);
    return rc.detectKindFromSheets(sheets);
  } catch {
    return null;
  }
}

export async function load_fa(
  buffer: ArrayBuffer | Uint8Array,
  fileName = 'fa.xlsx'
): Promise<rc.FAPlayer[]> {
  const sheets = await readWorkbookSheets(buffer, fileName);
  return rc.loadFaFromSheets(sheets, fileName);
}

export async function load_thrive(
  buffer: ArrayBuffer | Uint8Array,
  fileName = 'thrive.xlsx',
  missing?: Array<[string, string]>
): Promise<rc.ThrivePlayer[]> {
  const sheets = await readWorkbookSheets(buffer, fileName);
  return rc.loadThriveFromSheets(sheets, fileName, missing);
}

export async function load_staff(
  buffer: ArrayBuffer | Uint8Array,
  fileName = 'managers.xlsx'
): Promise<rc.Staff[]> {
  const sheets = await readWorkbookSheets(buffer, fileName);
  return rc.loadStaffFromSheets(sheets, fileName);
}

// --------------------------------------------------------------------------- Excel writing

function getColumnLetter(colIndex1Based: number): string {
  let n = colIndex1Based;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function sheetName(wb: ExcelJS.Workbook, base: string): string {
  const cleaned = base.replace(/[\[\]:*?/\\]/g, '').trim().slice(0, 31) || 'Sheet';
  const existing = new Set(wb.worksheets.map((ws) => ws.name));
  let candidate = cleaned;
  let n = 2;
  while (existing.has(candidate)) {
    const suffix = ` ${n}`;
    candidate = cleaned.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  return candidate;
}

function toExcelValue(v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined) return '';
  if (rc.isLocalDate(v)) {
    return new Date(Date.UTC(v.year, v.month - 1, v.day));
  }
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
    return v;
  }
  return String(v);
}

function displayLength(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (rc.isLocalDate(v)) return 10;
  return Math.min(String(v).length, 60);
}

function formatNow(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function writeTable(
  ws: ExcelJS.Worksheet,
  headers: string[],
  rows: Array<[unknown[], string | null]>,
  titleLines: string[] = [],
  fillCols: number | null = null
): void {
  let r = 1;
  titleLines.forEach((line, i) => {
    const cell = ws.getCell(r, 1);
    cell.value = line;
    cell.font = {
      bold: i === 0,
      size: i === 0 ? 14 : 10,
      color: { argb: line.startsWith('CONFIDENTIAL') ? 'FFC00000' : 'FF000000' },
    };
    r += 1;
  });
  if (titleLines.length > 0) {
    r += 1;
  }
  const hdr = r;
  headers.forEach((title, idx) => {
    const j = idx + 1;
    const c = ws.getCell(hdr, j);
    c.value = title;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF305496' },
    };
    c.alignment = { wrapText: true, vertical: 'top' };
  });

  const widths = headers.map((h) => h.length);
  rows.forEach(([values, fill], rowIdx) => {
    const i = hdr + 1 + rowIdx;
    values.forEach((v, colIdx) => {
      const j = colIdx + 1;
      const c = ws.getCell(i, j);
      c.value = toExcelValue(v);
      if (rc.isLocalDate(v)) {
        c.numFmt = 'dd/mm/yyyy';
        c.alignment = { horizontal: 'left' };
      }
      if (fill && (fillCols === null || j <= fillCols)) {
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF' + fill },
        };
      }
      widths[colIdx] = Math.max(widths[colIdx], displayLength(v));
    });
  });

  widths.forEach((w, colIdx) => {
    ws.getColumn(colIdx + 1).width = Math.max(8, Math.min(w + 2, 62));
  });

  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: hdr }];
  const lastCol = getColumnLetter(headers.length);
  const lastRow = Math.max(hdr + rows.length, hdr + 1);
  ws.autoFilter = `A${hdr}:${lastCol}${lastRow}`;
}

function resultRows(rows: rc.Row[]): Array<[unknown[], string]> {
  return rows.map((r) => [rc.COLUMNS.map(([, attr]) => r[attr]), rc.FILLS[r.level]]);
}

function teamTitle(
  label: string,
  rows: Array<[unknown[], string]>,
  staff: string[] = []
): string[] {
  const counts: Record<string, number> = {
    Both: 0,
    'FA only': 0,
    'Thrive only': 0,
    [rc.NO_FA]: 0,
  };
  for (const [, src] of rows) {
    counts[src] = (counts[src] || 0) + 1;
  }
  return [
    `Team: ${label}`,
    ...staff,
    `Generated ${formatNow()}`,
    `${rows.length} players   |   Both: ${counts['Both']}   FA only: ${counts['FA only']}   ` +
      `Thrive only: ${counts['Thrive only']}` +
      (counts[rc.NO_FA] ? `   No FA needed: ${counts[rc.NO_FA]}` : ''),
    'Colour key: green = in both FA and Thrive, orange = FA only, blue = Thrive only, ' +
      'grey = Thrive group with no FA team (only the mandate is checked)',
    rc.CONFIDENTIAL,
  ];
}

function writeConsentsSheet(
  ws: ExcelJS.Worksheet,
  result: rc.Result,
  today?: rc.LocalDate
): void {
  const [headers, rows, checked] = rc.consents_report(result, today);
  const checkedLine =
    checked.length > 0
      ? 'Checked: ' + checked.join(', ')
      : 'No consent columns were found in the Thrive export, so nothing could be checked.';
  writeTable(
    ws,
    headers,
    rows.map(([v, src]) => [v, rc.SOURCE_FILLS[src]]),
    ['Missing consents', rc.CONSENTS_NOTE, checkedLine, rc.CONFIDENTIAL],
    4
  );
}

function writeMatchdaySheet(
  ws: ExcelJS.Worksheet,
  result: rc.Result,
  label: string,
  include_medical: boolean,
  today?: rc.LocalDate
): void {
  const [headers, rows, flags] = rc.matchday_rows(result, label, include_medical, today);
  const c1 = ws.getCell(1, 1);
  c1.value = `Matchday sheet: ${label}`;
  c1.font = { bold: true, size: 16 };

  const c2 = ws.getCell(2, 1);
  c2.value =
    rc.staff_lines(result, label).join('   ') || 'Manager: ______________________';
  c2.font = { size: 11 };

  const c3 = ws.getCell(3, 1);
  c3.value =
    'Date: ______________   Opponent: ______________________   Venue: ______________________   Kick-off: ________';
  c3.font = { size: 11 };

  const hdr = 5;
  const thinBorder: Partial<ExcelJS.Borders> = {
    left: { style: 'thin', color: { argb: 'FF808080' } },
    right: { style: 'thin', color: { argb: 'FF808080' } },
    top: { style: 'thin', color: { argb: 'FF808080' } },
    bottom: { style: 'thin', color: { argb: 'FF808080' } },
  };

  headers.forEach((title, idx) => {
    const j = idx + 1;
    const c = ws.getCell(hdr, j);
    c.value = title;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF305496' },
    };
    c.alignment = { wrapText: true, vertical: 'middle' };
    c.border = thinBorder;
  });

  const medCol = headers.includes('Medical alert')
    ? headers.indexOf('Medical alert') + 1
    : null;
  const photoCol = headers.includes('Photos OK')
    ? headers.indexOf('Photos OK') + 1
    : null;

  rows.forEach((values, rowIdx) => {
    const i = hdr + 1 + rowIdx;
    const flag = flags[rowIdx];
    values.forEach((v, colIdx) => {
      const j = colIdx + 1;
      const c = ws.getCell(i, j);
      c.value = toExcelValue(v);
      c.font = { size: 11, bold: j === 2 };
      c.alignment = { wrapText: true, vertical: 'top' };
      c.border = thinBorder;
    });
    if (medCol !== null && flag.has('medical')) {
      const mc = ws.getCell(i, medCol);
      mc.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8CBAD' },
      };
      mc.font = { size: 11, bold: true, color: { argb: 'FF9C0006' } };
    }
    if (photoCol !== null && flag.has('no_photo')) {
      const pc = ws.getCell(i, photoCol);
      pc.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC7CE' },
      };
      pc.font = { size: 11, bold: true, color: { argb: 'FF9C0006' } };
    }
    ws.getRow(i).height = 30;
  });

  const widthMap: Record<string, number> = {
    Here: 6,
    Player: 24,
    Age: 5,
    'Parent / contact': 22,
    'Contact phone': 16,
    'Emergency contact': 22,
    'Emergency phone': 16,
    'Medical alert': 40,
    'Photos OK': 9,
  };
  headers.forEach((title, idx) => {
    ws.getColumn(idx + 1).width = widthMap[title] ?? 14;
  });

  const end = hdr + rows.length + 2;
  const confCell = ws.getCell(end, 1);
  confCell.value = rc.CONFIDENTIAL;
  confCell.font = { color: { argb: 'FFC00000' }, bold: true };

  const noteCell = ws.getCell(end + 1, 1);
  noteCell.value = rc.MATCHDAY_NOTE;
  noteCell.font = { size: 9 };

  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${hdr}:${hdr}`,
    horizontalCentered: true,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    },
  };
  ws.headerFooter = {
    oddFooter: "&CCONFIDENTIAL: children's personal data. Destroy after use.&RPage &P of &N",
  };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: hdr }];
}

export async function buildFullWorkbookBuffer(
  result: rc.Result,
  team_map: Record<string, string | null>,
  fa_file = '',
  thrive_file = '',
  include_medical = true,
  today?: rc.LocalDate
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Summary');
  const a1 = ws.getCell('A1');
  a1.value = 'Player reconciliation: FA registration vs Thrive';
  a1.font = { bold: true, size: 14 };

  const baseFa = fa_file.split(/[\\/]/).pop() || fa_file;
  const baseThrive = thrive_file.split(/[\\/]/).pop() || thrive_file;
  ws.getCell('A3').value = 'Run';
  ws.getCell('B3').value = formatNow();
  ws.getCell('A4').value = 'FA report';
  ws.getCell('B4').value = baseFa;
  ws.getCell('A5').value = 'Thrive export';
  ws.getCell('B5').value = baseThrive;
  ws.getCell('A6').value = 'Medical data included';
  ws.getCell('B6').value = include_medical ? 'Yes' : 'No';
  ws.getCell('A7').value = 'App version';
  ws.getCell('B7').value = rc.VERSION;

  const counts = result.counts();
  let r = 9;
  ws.getCell(r, 1).value = 'Result';
  ws.getCell(r, 1).font = { bold: true };
  ws.getCell(r, 2).value = 'Players';
  ws.getCell(r, 2).font = { bold: true };

  for (const name of Object.keys(rc.LEVELS)) {
    r += 1;
    const c1 = ws.getCell(r, 1);
    c1.value = name;
    c1.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + rc.FILLS[rc.LEVELS[name]] },
    };
    ws.getCell(r, 2).value = counts[name] || 0;
  }

  ws.getCell(r + 2, 1).value = 'Rows with data quality flags';
  ws.getCell(r + 2, 2).value = result.rows.filter((x) => Boolean(x.dq)).length;

  const [npHeaders, npRows] = rc.not_paying_report(result, today);
  ws.getCell(r + 3, 1).value = 'Not paying (no mandate / not in Thrive)';
  ws.getCell(r + 3, 2).value = npRows.length;
  r += 1;
  ws.getCell(r + 3, 1).value = 'Missing a consent';
  ws.getCell(r + 3, 2).value = rc.consents_report(result, today)[1].length;

  ws.getCell(r + 5, 1).value = 'Teams';
  ws.getCell(r + 5, 1).font = { bold: true };
  ws.getCell(r + 5, 2).value = 'Players';
  ws.getCell(r + 5, 2).font = { bold: true };
  const hasStaff = Object.keys(result.staff).length > 0;
  if (hasStaff) {
    ws.getCell(r + 5, 3).value = 'Manager(s) and assistants';
    ws.getCell(r + 5, 3).font = { bold: true };
  }

  const labels = rc.team_labels(result);
  labels.forEach((label, idx) => {
    const rowNum = r + 6 + idx;
    ws.getCell(rowNum, 1).value = label;
    ws.getCell(rowNum, 2).value = (result.teams[label] || []).length;
    if (hasStaff) {
      ws.getCell(rowNum, 3).value = rc.staff_lines(result, label).join('   ');
    }
  });

  let end = r + 7 + Object.keys(result.teams).length;
  for (const note of result.staff_issues) {
    ws.getCell(end, 1).value = 'Managers file: ' + note;
    end += 1;
  }
  const conf = ws.getCell(end + 1, 1);
  conf.value = rc.CONFIDENTIAL;
  conf.font = { color: { argb: 'FFC00000' } };

  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 60;

  const tabOrder = [...rc.RESULT_TABS.slice(1), ...rc.RESULT_TABS.slice(0, 1)];
  for (const [title, pred] of tabOrder) {
    const tabWs = wb.addWorksheet(sheetName(wb, title));
    writeTable(
      tabWs,
      rc.COLUMNS.map(([c]) => c),
      resultRows(result.rows.filter((x) => pred(x))),
      [],
      4
    );
    if (title === 'Data quality') {
      const npWs = wb.addWorksheet(sheetName(wb, 'Not paying'));
      writeTable(
        npWs,
        npHeaders,
        npRows.map(([v, src]) => [v, rc.SOURCE_FILLS[src]]),
        ['Not paying: no active mandate or not in Thrive', rc.NOT_PAYING_NOTE, rc.CONFIDENTIAL]
      );
      const consWs = wb.addWorksheet(sheetName(wb, 'Missing consents'));
      writeConsentsSheet(consWs, result, today);
    }
  }

  for (const label of labels) {
    const [headers, rows] = rc.team_report(result, label, include_medical, today);
    const teamWs = wb.addWorksheet(sheetName(wb, `Team ${label}`));
    writeTable(
      teamWs,
      headers,
      rows.map(([v, src]) => [v, rc.SOURCE_FILLS[src]]),
      teamTitle(label, rows, rc.staff_lines(result, label)),
      7
    );
  }

  const ms = wb.addWorksheet('Team mapping');
  ms.addRow(['Thrive team', 'FA team']);
  ms.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
  });
  for (const k of Object.keys(team_map).sort()) {
    ms.addRow([k, team_map[k] !== rc.IGNORE ? team_map[k] : '(ignore)']);
  }
  ms.getColumn(1).width = 24;
  ms.getColumn(2).width = 40;

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

export async function buildTeamWorkbookBuffer(
  result: rc.Result,
  label: string,
  include_medical = true,
  today?: rc.LocalDate
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const matchWs = wb.addWorksheet(sheetName(wb, 'Matchday sheet'));
  writeMatchdaySheet(matchWs, result, label, include_medical, today);

  const [headers, rows] = rc.team_report(result, label, include_medical, today);
  const teamWs = wb.addWorksheet(sheetName(wb, `Team ${label}`));
  writeTable(
    teamWs,
    headers,
    rows.map(([v, src]) => [v, rc.SOURCE_FILLS[src]]),
    teamTitle(label, rows, rc.staff_lines(result, label)),
    7
  );

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

export async function buildEachTeamZipBuffer(
  result: rc.Result,
  include_medical = true,
  today?: rc.LocalDate
): Promise<{ zipBytes: Uint8Array; files: Record<string, Uint8Array> }> {
  const todayDate = today ?? rc.todayLocalDate();
  const dateStr = `${todayDate.year}-${String(todayDate.month).padStart(2, '0')}-${String(
    todayDate.day
  ).padStart(2, '0')}`;
  const folderPrefix = `Team files ${dateStr}/`;
  const zipEntries: Record<string, Uint8Array> = {};
  const files: Record<string, Uint8Array> = {};

  for (const label of rc.team_labels(result)) {
    const safeName = label
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '_');
    const fileName = `Team_${safeName}.xlsx`;
    const bytes = await buildTeamWorkbookBuffer(result, label, include_medical, todayDate);
    files[fileName] = bytes;
    zipEntries[folderPrefix + fileName] = bytes;
  }

  return {
    zipBytes: zipSync(zipEntries),
    files,
  };
}

export async function buildNotPayingWorkbookBuffer(
  result: rc.Result,
  today?: rc.LocalDate
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Not paying');
  const [headers, rows] = rc.not_paying_report(result, today);
  writeTable(
    ws,
    headers,
    rows.map(([v, src]) => [v, rc.SOURCE_FILLS[src]]),
    ['Not paying: no active mandate or not in Thrive', rc.NOT_PAYING_NOTE, rc.CONFIDENTIAL]
  );
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

export async function buildConsentsWorkbookBuffer(
  result: rc.Result,
  today?: rc.LocalDate
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Missing consents');
  writeConsentsSheet(ws, result, today);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

export async function buildStaffTemplateBuffer(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Managers');
  ws.addRow(['Name', 'Role', 'Team(s)', 'Phone', 'Email']);
  ws.addRow(['Alex Example', 'Manager', 'U12 Black', '07700 900010', 'alex@example.com']);
  ws.addRow(['Pat Sample', 'Assistant manager', 'U12 Black, U10 Blue', '07700 900011', '']);
  ws.addRow(['Sam Demo', 'Manager', 'U8 Red', '', '']);
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true };
  });
  [22, 20, 30, 16, 28].forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  const notes = wb.addWorksheet('How to fill in');
  const lines = [
    'Replace the example rows with your own. Delete this sheet if you like.',
    'Name: the manager or assistant manager.',
    'Role: Manager or Assistant manager. Blank means Manager.',
    'Team(s): the team or teams they look after, separated by commas. Use the same names as the FA or Thrive, for example U12 Black.',
    'Phone and Email are optional.',
    'Alternative layout: one row per team with the columns Team, Manager and Assistant manager. Several names in one cell can be separated by commas.',
    'A CSV file with the same columns also works.',
    'This file contains personal data about adults. Keep it secure.',
  ];
  for (const line of lines) {
    notes.addRow([line]);
  }
  notes.getColumn(1).width = 110;

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}
