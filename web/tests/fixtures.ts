/**
 * Generates shared parity test fixtures (invented sample FA and Thrive exports + expected JSON output)
 * so both the Python test suite and the TypeScript (Vitest) test suite verify identical results.
 * Never put real player data in tests.
 */
import ExcelJS from 'exceljs';
import * as rc from '../src/reconcile_core';

export const REF_TODAY: rc.LocalDate = { year: 2026, month: 11, day: 11 };
export const SEASON_YEAR = rc._season_ref(REF_TODAY).year; // 2026

export function born(age_group: number, month: number, day = 1): rc.LocalDate {
  return { year: SEASON_YEAR - age_group + 1, month, day };
}

export const THRIVE_HEADERS = [
  'First name',
  'Last name',
  'Date of birth',
  'Teams',
  'Active mandates',
  'Account owner',
  'Owner phone',
  'Parents/guardian name, required for FA registration',
  'Parents/guardian email address for FA registration',
  'Parents/guardian date of birth required for FA registration',
  'Has medical conditions',
  'Medical conditions',
  'Allergies',
  'Medicines',
  'Medical notes',
  'WWFC photography policy',
  'WWFC code of conduct - youth players',
  'Club rules',
];

export const CONSENTED: Record<string, string> = {
  'WWFC photography policy': 'Yes',
  'WWFC code of conduct - youth players': 'I agree',
  'Club rules': 'Yes',
};

export type ThriveFixtureRow = [
  string,
  string,
  rc.LocalDate | null,
  string,
  string,
  Record<string, string>
];

export const THRIVE_PLAYERS: ThriveFixtureRow[] = [
  ['Amy', 'Able', born(11, 2), 'U11 White', 'Active', {}],
  ['Ben', 'Bold', born(11, 3), 'U11 White', '', { 'WWFC photography policy': 'No' }],
  [
    'Cal',
    'Cole',
    born(12, 4),
    'U12 Black',
    'Active',
    {
      'Has medical conditions': 'True',
      'Medical conditions': 'Asthma',
      Medicines: 'Inhaler',
      'WWFC code of conduct - youth players': '',
    },
  ],
  ['Samuel', 'Smith', born(11, 5, 5), 'U11 White', 'Active', {}],
  ['Eve', 'East', born(11, 6, 6), 'U11 White', 'Active', {}],
  ['Tia', 'Tiny', born(5, 7, 7), 'U05', '', {}],
];

export type FaFixtureRow = [string, string, string, rc.LocalDate | null, string, string];

export const FA_PLAYERS: FaFixtureRow[] = [
  ['Amy', 'Able', '1001', born(11, 2), 'U11 White', 'Registered'],
  ['Ben', 'Bold', '1002', born(11, 3), 'U11 White', 'Registered'],
  ['Cal', 'Cole', '1003', born(12, 4), 'U12 Black', 'Registered'],
  ['Sam', 'Smith', '1004', born(11, 5, 5), 'U11 White', 'Registered'],
  ['Dan', 'Dee', '1005', born(12, 8, 8), 'U12 Black', 'Registered'],
  ['Zed', 'Zee', '1006', born(12, 6, 9), 'U12 Black', 'Cancelled'],
];

export const FA_HEADERS = [
  'First names',
  'Surname',
  'FAN ID',
  'Date of birth',
  'Team',
  'Registration status',
  'Parent/carer name',
  'Parent/carer email address',
  'Emergency contact',
  'Emergency contact phone',
];

function toExcelDate(d: rc.LocalDate | null): Date | string {
  if (!d) return '';
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

export async function createThriveBuffer(
  headers: string[] = THRIVE_HEADERS,
  players: ThriveFixtureRow[] = THRIVE_PLAYERS
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet');
  ws.addRow(['Thrive data export']);
  ws.addRow(headers);
  for (const [first, last, dob, teams, mandate, extra] of players) {
    const rowMap: Record<string, unknown> = {
      'First name': first,
      'Last name': last,
      'Date of birth': toExcelDate(dob),
      Teams: teams,
      'Active mandates': mandate,
      'Account owner': `Pat ${last}`,
      'Owner phone': '07700900123',
      'Has medical conditions': 'False',
      ...CONSENTED,
      ...extra,
    };
    ws.addRow(headers.map((h) => rowMap[h] ?? ''));
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

export async function createFaBuffer(
  players: FaFixtureRow[] = FA_PLAYERS
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet');
  ws.addRow(FA_HEADERS);
  for (const [first, last, fan, dob, team, status] of players) {
    ws.addRow([
      first,
      last,
      fan,
      toExcelDate(dob),
      rc.CLUB + team,
      status,
      `Pat ${last}`,
      `pat.${last.toLowerCase()}@example.com`,
      `Lee ${last}`,
      '07700900456',
    ]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}
