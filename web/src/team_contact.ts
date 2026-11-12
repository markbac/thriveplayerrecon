/**
 * Web-only helpers for contacting team managers: WhatsApp click-to-chat links (wa.me)
 * and unpaid counts for the team pickers. Kept out of reconcile_core.ts so the
 * Python/TypeScript parity surface is unchanged.
 */
import * as rc from './reconcile_core';

/** Country code used for national numbers such as 07700 900010 (the club is in the UK). */
export const DEFAULT_COUNTRY_CODE = '44';

/**
 * Turn a phone number from the managers file into the digits-only international form that
 * wa.me expects (no +, no leading 0). Returns null if it does not look like a phone number.
 *   07700 900010     -> 447700900010
 *   +44 7700 900010  -> 447700900010
 *   0044 7700 900010 -> 447700900010
 */
export function whatsappNumber(phone: string, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  // Several numbers in one cell ("07700 900010 / 07700 900011"): use the first one.
  const first = (phone || '').split(/[,;/]|\bor\b/i)[0] || '';
  const cleaned = first.replace(/[^\d+]/g, '');
  let digits: string;
  if (cleaned.startsWith('+')) {
    digits = cleaned.slice(1).replace(/\D/g, '');
  } else if (cleaned.startsWith('00')) {
    digits = cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    digits = countryCode + cleaned.slice(1);
  } else if (cleaned.length === 10 && cleaned.startsWith('7')) {
    // UK mobile typed without its leading 0 (common when Excel stores it as a number)
    digits = countryCode + cleaned;
  } else {
    digits = cleaned.replace(/\D/g, '');
  }
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

/** https://wa.me/<number>?text=<message>, or null if the number is not usable. */
export function whatsappLink(phone: string, text: string): string | null {
  const number = whatsappNumber(phone);
  if (!number) return null;
  const trimmed = (text || '').trim();
  return trimmed
    ? `https://wa.me/${number}?text=${encodeURIComponent(trimmed)}`
    : `https://wa.me/${number}`;
}

export interface ManagerContact {
  name: string;
  phone: string;
}

/** Managers of a team who have a usable WhatsApp number in the managers file. */
export function managerContacts(result: rc.Result, label: string): ManagerContact[] {
  const out: ManagerContact[] = [];
  const seen = new Set<string>();
  for (const person of result.staff[label] || []) {
    if (person.kind !== 'manager') continue;
    const number = whatsappNumber(person.phone);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    out.push({ name: person.name.trim() || 'manager', phone: person.phone });
  }
  return out;
}

/** Number of players in a team who will not be paying through Thrive. */
export function unpaidCount(result: rc.Result, label: string): number {
  return (result.teams[label] || []).filter(([, row]) => rc._not_paying(row)).length;
}

function unpaidSuffix(count: number): string {
  return count > 0 ? `${count} not paying` : '✔ all paying';
}

/** e.g. "U12 Black (Alex Example) — 2 not paying" or "U10 Blue (Sam Green) — ✔ all paying". */
export function teamChoiceLabelWithUnpaid(result: rc.Result, label: string): string {
  return `${rc.team_choice_label(result, label)} — ${unpaidSuffix(unpaidCount(result, label))}`;
}

/** Label for the Not paying picker, where the count comes from the grouped list (incl. "No team"). */
export function notPayingChoiceLabel(result: rc.Result, label: string, count: number): string {
  const base = label in result.teams ? rc.team_choice_label(result, label) : label;
  return `${base} — ${unpaidSuffix(count)}`;
}
