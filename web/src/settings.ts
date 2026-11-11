/**
 * Browser settings persistence in localStorage, plus JSON file export/import.
 * Never stores player data, file contents or personal information.
 */
import * as rc from './reconcile_core';

export const STORAGE_KEY = 'PlayerReconcile.settings.v1';

export interface AppSettings {
  fuzzy: number;
  medical: boolean;
  team_map: Record<string, string | null>;
  team: string;
}

const ALLOWED_KEYS = new Set<keyof AppSettings>(['fuzzy', 'medical', 'team_map', 'team']);

export function defaultSettings(): AppSettings {
  return {
    fuzzy: rc.DEFAULT_FUZZY,
    medical: true,
    team_map: { ...rc.DEFAULT_TEAM_MAP },
    team: '',
  };
}

export function sanitizeSettings(raw: unknown): AppSettings {
  const def = defaultSettings();
  if (!raw || typeof raw !== 'object') return def;
  const obj = raw as Record<string, unknown>;

  let fuzzy = def.fuzzy;
  if (typeof obj.fuzzy === 'number' && !Number.isNaN(obj.fuzzy)) {
    fuzzy = Math.min(1.0, Math.max(0.6, Math.round(obj.fuzzy * 100) / 100));
  }

  const medical = typeof obj.medical === 'boolean' ? obj.medical : def.medical;
  const team = typeof obj.team === 'string' ? obj.team : def.team;

  let team_map = { ...rc.DEFAULT_TEAM_MAP };
  if (obj.team_map && typeof obj.team_map === 'object' && !Array.isArray(obj.team_map)) {
    team_map = {};
    for (const [k, v] of Object.entries(obj.team_map as Record<string, unknown>)) {
      if (typeof k === 'string' && k.trim()) {
        if (v === null) {
          team_map[k] = null;
        } else if (typeof v === 'string') {
          team_map[k] = v;
        }
      }
    }
  }

  return { fuzzy, medical, team_map, team };
}

export function loadSettings(storage: Storage = window.localStorage): AppSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(
  settings: AppSettings,
  storage: Storage = window.localStorage
): void {
  const clean: Record<string, unknown> = {};
  const sanitized = sanitizeSettings(settings);
  for (const key of ALLOWED_KEYS) {
    clean[key] = sanitized[key];
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(clean, null, 2));
  } catch {
    // Ignore storage quota errors in restricted/private browsing modes
  }
}

export function serializeSettingsForExport(settings: AppSettings): string {
  const sanitized = sanitizeSettings(settings);
  return JSON.stringify(
    {
      app: rc.APP_NAME,
      version: rc.VERSION,
      fuzzy: sanitized.fuzzy,
      medical: sanitized.medical,
      team_map: sanitized.team_map,
      team: sanitized.team,
    },
    null,
    2
  );
}

export function parseImportedSettings(jsonText: string): AppSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (exc) {
    throw new Error(`Invalid settings JSON file: ${exc}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Settings file must be a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  if (!('team_map' in obj) && !('fuzzy' in obj) && !('medical' in obj)) {
    throw new Error('File does not contain Player Reconcile settings (team_map, fuzzy, medical).');
  }
  return sanitizeSettings(obj);
}
