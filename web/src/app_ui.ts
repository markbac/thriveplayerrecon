/**
 * Interactive client-side UI controller for Player Reconciliation (Web App).
 * Implements issues #18, #19, #20, #21, #22, #23, #24.
 */
import * as rc from './reconcile_core';
import * as settingsMod from './settings';
import {
  BANNER_TEXT,
  HELP_SECTIONS,
  IGNORE_LABEL,
  PROGRESS_STEPS,
  UNMAPPED_LABEL,
  VIEW_GROUPS,
  WHATSAPP_WARNING,
  export_warning,
} from './help_content';
import type { LoadedFilesPayload, ReconcileInput } from './reconcile_runner';
import * as contact from './team_contact';
import * as staffStore from './staff_store';
import type * as CoachesModule from './coaches';
import { FILTERS as COACH_FILTERS, WINDOW_COLOURS } from './coaches';
import * as clubData from './club_data';
import changelogText from '../../CHANGELOG.md?raw';

export interface ChosenFile {
  name: string;
  buffer: ArrayBuffer;
}

function sortKey(value: unknown): [number, number, string] {
  const s = String(value ?? '').trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) {
    return [0, Number(m[3] + m[2] + m[1]), ''];
  }
  const num = Number(s);
  if (s !== '' && !Number.isNaN(num)) {
    return [0, num, ''];
  }
  return [s ? 1 : 2, 0, s.toLowerCase()];
}

function compareSortKeys(a: [number, number, string], b: [number, number, string]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;
}

function levelBadge(level: rc.Level): string {
  switch (level) {
    case 'ok':
      return '✔ ';
    case 'warn':
      return '⚠ ';
    case 'bad':
      return '✖ ';
    case 'info':
      return 'ℹ ';
  }
}

function sourceBadge(source: string): string {
  switch (source) {
    case 'Both':
      return '✔ Both';
    case 'FA only':
      return '▲ FA only';
    case 'Thrive only':
      return '● Thrive only';
    case rc.NO_FA:
      return 'ℹ No FA needed';
    default:
      return source;
  }
}

/** The CHANGELOG.md (bundled into the app at build time) as simple HTML: releases, sections and bullets. */
export function renderChangelog(markdown: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'changelog-body';
  let list: HTMLUListElement | null = null;
  const inline = (el: HTMLElement, text: string) => {
    // **bold** and `code`; everything else as plain text (never HTML)
    for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
      if (!part) continue;
      if (part.startsWith('**')) {
        const b = document.createElement('strong');
        b.textContent = part.slice(2, -2);
        el.appendChild(b);
      } else if (part.startsWith('`')) {
        const c = document.createElement('code');
        c.textContent = part.slice(1, -1);
        el.appendChild(c);
      } else {
        el.appendChild(document.createTextNode(part.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')));
      }
    }
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h2 = /^## \[(.+?)\](.*)$/.exec(line);
    const h3 = /^### (.+)$/.exec(line);
    if (h2) {
      if (h2[1].toLowerCase() === 'unreleased') {
        list = null;
        continue;
      }
      const h = document.createElement('h3');
      h.textContent = `${h2[1]}${h2[2].replace(/^\s*-\s*/, ' (').replace(/(\d{4}-\d{2}-\d{2})$/, '$1)')}`;
      root.appendChild(h);
      list = null;
    } else if (h3) {
      const h = document.createElement('h4');
      h.textContent = h3[1];
      root.appendChild(h);
      list = null;
    } else if (/^- /.test(line)) {
      if (!list) {
        list = document.createElement('ul');
        root.appendChild(list);
      }
      const li = document.createElement('li');
      inline(li, line.slice(2));
      list.appendChild(li);
    }
  }
  return root;
}

function downloadBlob(bytes: Uint8Array | string, fileName: string, mimeType: string): void {
  const blob =
    typeof bytes === 'string'
      ? new Blob([bytes], { type: mimeType })
      : new Blob([bytes as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The Excel library is large, so it is only loaded when a file is exported. */
function loadExcelIo(): Promise<typeof import('./excel_io')> {
  return import('./excel_io');
}

/** Error the background worker reported about the files themselves (not a worker start-up failure). */
class WorkerReportedError extends Error {}

/** Latest GitHub release, where the Windows app (.exe) can be downloaded. */
export const WINDOWS_APP_URL = 'https://github.com/markbac/thriveplayerrecon/releases/latest';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/** Make a table heading sortable by mouse and keyboard, and tell screen readers its sort order. */
function makeSortableHeader(
  th: HTMLTableCellElement,
  active: boolean,
  desc: boolean,
  onSort: () => void
): void {
  th.tabIndex = 0;
  th.classList.add('sortable-th');
  th.setAttribute('aria-sort', active ? (desc ? 'descending' : 'ascending') : 'none');
  th.title = 'Sort by this column (click or press Enter)';
  th.addEventListener('click', onSort);
  th.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSort();
    }
  });
}

function todayIsoDate(): string {
  const d = rc.todayLocalDate();
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export class WebApp {
  root: HTMLElement;
  settings: settingsMod.AppSettings;
  storage: Storage;

  faFile: ChosenFile | null = null;
  thriveFile: ChosenFile | null = null;
  staffFile: ChosenFile | null = null;
  qualFile: ChosenFile | null = null;
  staffRemembered = false;
  coaches: CoachesModule.CoachesResult | null = null;
  clubData: clubData.ClubData = { left_players: [], coach_notes: {}, paid_outside: [] };
  leftRows: rc.Row[] = [];
  paidRows: rc.Row[] = [];
  coachFilter = 'All coaches';
  coachSearch = '';

  faPlayers: rc.FAPlayer[] | null = null;
  thrivePlayers: rc.ThrivePlayer[] | null = null;
  staff: rc.Staff[] = [];
  missingItems: Array<[string, string]> = [];
  result: rc.Result | null = null;
  runFilesKey: string | null = null;
  busy = false;

  activeTab: 'results' | 'teams' | 'not-paying' | 'consents' | 'coaches' | 'left' | 'paid' | 'mappings' = 'results';
  currentView = 'All players';
  resultsSearch = '';
  resultsSort: { col: keyof rc.Row | null; desc: boolean } = { col: null, desc: false };

  teamSearch = '';
  teamOnlyUnpaid = false;
  teamSort: { col: number | null; desc: boolean } = { col: null, desc: false };

  npSearch = '';
  npSort: { col: number | null; desc: boolean } = { col: null, desc: false };

  consSearch = '';
  consSort: { col: number | null; desc: boolean } = { col: null, desc: false };

  selectedMappingTeam = '';
  selectedMappingTarget = '';
  modalReturnFocus: HTMLElement | null = null;

  constructor(root: HTMLElement, storage: Storage = window.localStorage) {
    this.root = root;
    this.storage = storage;
    this.settings = settingsMod.loadSettings(this.storage);
    this.clubData = clubData.loadClubData(this.storage);
    this.renderShell();
    this.restoreRememberedStaff();
    this.bindGlobalShortcuts();
    this.refreshAll();
  }

  private persistSettings(): void {
    settingsMod.saveSettings(this.settings, this.storage);
  }

  private currentFilesSignature(): string {
    return [
      this.faFile ? `${this.faFile.name}:${this.faFile.buffer.byteLength}` : '',
      this.thriveFile ? `${this.thriveFile.name}:${this.thriveFile.buffer.byteLength}` : '',
      this.staffFile ? `${this.staffFile.name}:${this.staffFile.buffer.byteLength}` : '',
      this.qualFile ? `${this.qualFile.name}:${this.qualFile.buffer.byteLength}` : '',
    ].join('|');
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <header class="app-header">
        <div class="app-brand">
          <img src="./logo_32.png" alt="" aria-hidden="true" />
          <h1>${rc.APP_TITLE}: FA vs Thrive</h1>
          <span class="app-version-badge" id="version-badge">v${rc.VERSION}</span>
          <span class="app-version-badge" id="build-date-badge">Created ${rc.BUILD_DATETIME}</span>
        </div>
        <nav class="app-nav-actions" aria-label="Application menu">
          <button type="button" id="nav-help-quick">How to use (F1)</button>
          <button type="button" id="nav-help-exports">Getting the exports</button>
          <button type="button" id="nav-help-privacy">Data protection</button>
          <a href="./PlayerReconcile-web-offline.zip" download="PlayerReconcile-web-offline.zip" class="nav-download-link" id="nav-offline-zip" title="Download the web app as a zip to run locally offline">Download offline copy (.zip)</a>
          <a href="${WINDOWS_APP_URL}" target="_blank" rel="noopener noreferrer" class="nav-download-link" id="nav-windows-app" title="Opens the latest release on GitHub. Download the PlayerReconcile .exe file there to run the Windows app">Download Windows app</a>
          <button type="button" id="nav-about">About</button>
        </nav>
      </header>

      <section class="gdpr-banner" role="region" aria-label="Data protection notice">
        <p id="banner-text"></p>
        <button type="button" id="banner-privacy-btn">Data protection guidance</button>
      </section>

      <div class="steps-collapsed-bar" id="steps-collapsed-bar" role="region" aria-label="Reconciled files summary" hidden>
        <span class="steps-collapsed-summary" id="steps-collapsed-summary"></span>
        <div class="steps-collapsed-actions">
          <button type="button" id="btn-expand-steps">Files &amp; Export ▾</button>
          <button type="button" class="btn-primary btn-compact" id="btn-reconcile-compact">Reconcile</button>
        </div>
      </div>

      <section class="steps-grid" id="steps-grid" aria-label="Reconciliation steps">
        <!-- Step 1 -->
        <div class="step-card">
          <div class="step-card-header">
            <h2 class="step-card-title">Step 1: choose your files (or drag and drop)</h2>
            <button type="button" class="btn-link" id="step1-howto-link">How to get these files</button>
          </div>
          <div class="file-rows">
            <div class="file-drop-row" id="drop-fa">
              <label for="input-fa">FA registration report (optional)</label>
              <div class="file-status-box" id="status-fa" aria-live="polite">No file chosen (tap or drop .xlsx)</div>
              <input type="file" id="input-fa" accept=".xlsx,.xlsm,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroenabled.12,text/csv,text/comma-separated-values,text/plain,application/zip,application/octet-stream" hidden />
              <button type="button" id="browse-fa">Browse...</button>
              <button type="button" id="clear-fa" aria-label="Clear FA report" hidden>✕</button>
            </div>
            <div class="file-drop-row" id="drop-thrive">
              <label for="input-thrive">Thrive data export</label>
              <div class="file-status-box" id="status-thrive" aria-live="polite">No file chosen (tap or drop .xlsx)</div>
              <input type="file" id="input-thrive" accept=".xlsx,.xlsm,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroenabled.12,text/csv,text/comma-separated-values,text/plain,application/zip,application/octet-stream" hidden />
              <button type="button" id="browse-thrive">Browse...</button>
              <button type="button" id="clear-thrive" aria-label="Clear Thrive export" hidden>✕</button>
            </div>
            <div class="file-drop-row" id="drop-staff">
              <label for="input-staff">Managers file (optional)</label>
              <div class="file-status-box" id="status-staff" aria-live="polite">Optional (.xlsx or .csv)</div>
              <input type="file" id="input-staff" accept=".xlsx,.xlsm,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroenabled.12,text/csv,text/comma-separated-values,text/plain,application/zip,application/octet-stream" hidden />
              <button type="button" id="browse-staff">Browse...</button>
              <button type="button" id="clear-staff" aria-label="Clear managers file" hidden>✕</button>
            </div>
            <div class="file-drop-row" id="drop-qual" title="The FA Team Qualifications Report from the Whole Game System (Reports > Team Qualifications Report). It fills the Coaches tab: DBS, First Aid and Safeguarding expiry for every team official. Works with or without the player files.">
              <label for="input-qual">FA qualifications (optional)</label>
              <div class="file-status-box" id="status-qual" aria-live="polite">Optional: Team Qualifications Report</div>
              <input type="file" id="input-qual" accept=".xlsx,.xlsm,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroenabled.12,text/csv,text/comma-separated-values,text/plain,application/zip,application/octet-stream" hidden />
              <button type="button" id="browse-qual">Browse...</button>
              <button type="button" id="clear-qual" aria-label="Clear FA qualifications report" hidden>✕</button>
            </div>
          </div>
          <div class="step1-actions">
            <span>Files are read in your browser and never uploaded.</span>
            <button type="button" id="btn-staff-template">Managers template...</button>
          </div>
          <label class="checkbox-row remember-staff-row" title="Keeps a copy of the managers file in this browser so you only need to pick the FA and Thrive files each week. Untick to delete it.">
            <input type="checkbox" id="chk-remember-staff" />
            <span>Remember managers list on this device</span>
          </label>
        </div>

        <!-- Step 2 -->
        <div class="step-card step2-box">
          <div class="step-card-header">
            <h2 class="step-card-title">Step 2: compare</h2>
          </div>
          <button type="button" class="btn-primary" id="btn-reconcile" title="Compare the two files (Ctrl+R)">Reconcile</button>
          <p class="run-state-text warn" id="run-state-label" aria-live="polite">Not run yet</p>
        </div>

        <!-- Step 3 -->
        <div class="step-card step3-box">
          <div class="step-card-header">
            <h2 class="step-card-title">Step 3: share</h2>
            <button type="button" class="btn-link" id="btn-collapse-steps" hidden>Hide steps ▲</button>
          </div>
          <button type="button" id="btn-export-teams-zip" class="export-action-btn" disabled>Export team files for managers (.zip)...</button>
          <button type="button" id="btn-export-full" class="export-action-btn" disabled>Export full workbook (.xlsx)...</button>
          <button type="button" id="btn-export-club-pdf" class="export-action-btn" disabled title="A PDF on the club template: every team, its coaches and players, and whether each player is in the FA, in Thrive and paying. Made in this browser, nothing is uploaded.">Club PDF: teams and players...</button>
          <label class="checkbox-row">
            <input type="checkbox" id="chk-medical" />
            <span>Include medical details</span>
          </label>
        </div>
      </section>

      <div class="hint-banner" id="hint-banner" role="status" aria-live="polite">
        Start here: choose your Thrive export (and the FA report, to check FA registration) in Step 1, then click Reconcile.
      </div>

      <!-- Main Tabs -->
      <main class="tabs-container">
        <div class="tablist" role="tablist" aria-label="Reconciliation sections">
          <button type="button" role="tab" class="tab-btn" id="tab-btn-results" aria-selected="true" aria-controls="panel-results" data-tab="results">Results</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-teams" aria-selected="false" aria-controls="panel-teams" data-tab="teams">Team sheets</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-not-paying" aria-selected="false" aria-controls="panel-not-paying" data-tab="not-paying">Not paying</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-consents" aria-selected="false" aria-controls="panel-consents" data-tab="consents">Missing consents</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-coaches" aria-selected="false" aria-controls="panel-coaches" data-tab="coaches">Coaches</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-left" aria-selected="false" aria-controls="panel-left" data-tab="left">Left the club</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-paid" aria-selected="false" aria-controls="panel-paid" data-tab="paid">Paying outside Thrive</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-mappings" aria-selected="false" aria-controls="panel-mappings" data-tab="mappings">Team mappings</button>
        </div>

        <!-- Panel 1: Results (#19) -->
        <section id="panel-results" role="tabpanel" aria-labelledby="tab-btn-results" class="tabpanel">
          <div class="results-layout">
            <aside class="results-sidebar" aria-label="Result views">
              <div class="view-list" id="view-list-container"></div>
              <div class="matching-settings-box">
                <h3>Matching settings</h3>
                <div class="fuzzy-row">
                  <label for="input-fuzzy">Name fuzziness</label>
                  <input type="number" id="input-fuzzy" class="fuzzy-input" min="0.60" max="1.00" step="0.05" />
                </div>
                <div class="fuzzy-hint">Lower = more tolerant of typos</div>
              </div>
            </aside>
            <div class="results-main">
              <div class="mobile-view-picker-bar">
                <label for="select-mobile-view">View</label>
                <select id="select-mobile-view"></select>
                <div class="mobile-fuzzy-group">
                  <label for="input-fuzzy-mobile">Fuzziness</label>
                  <input type="number" id="input-fuzzy-mobile" class="fuzzy-input" min="0.60" max="1.00" step="0.05" />
                </div>
              </div>
              <div class="results-head">
                <h2 id="results-view-title">All players</h2>
                <span class="summary-stats" id="results-summary-stats"></span>
              </div>
              <p class="view-desc" id="results-view-desc"></p>
              <div class="table-toolbar">
                <div class="search-input-group">
                  <label for="results-search">Search</label>
                  <input type="search" id="results-search" placeholder="Name, team or issue..." />
                  <button type="button" id="results-search-clear" title="Clear search" aria-label="Clear results search">✕</button>
                </div>
                <span class="toolbar-warn" id="results-filter-count"></span>
                <span class="toolbar-hint">Click any row for full details. Click a column heading to sort.</span>
              </div>
              <div class="table-wrapper">
                <div class="placeholder-overlay" id="placeholder-results">
                  <div>
                    <strong>Not reconciled yet</strong><br /><br />
                    Choose your FA report and Thrive export in Step 1,<br />
                    then click Reconcile in Step 2 (or press Ctrl+R).
                  </div>
                </div>
                <table class="data-table" id="table-results" aria-label="Reconciliation results">
                  <thead id="thead-results"></thead>
                  <tbody id="tbody-results"></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <!-- Panel 2: Team sheets (#20) -->
        <section id="panel-teams" role="tabpanel" aria-labelledby="tab-btn-teams" class="tabpanel" hidden>
          <p class="view-desc">
            For team managers: pick a team to see its players. The list shows the key facts. Click a player (or focus and press Enter) to see their contacts, medical details and consents. Use the arrow buttons (or Alt+Left / Alt+Right) to move between teams.
          </p>
          <div class="team-bar-row">
            <label for="select-team" class="team-select-label">Team</label>
            <button type="button" id="btn-team-prev" class="export-action-btn" title="Previous team (Alt+Left)" aria-label="Previous team" disabled>◀</button>
            <select id="select-team" class="team-select-dropdown"></select>
            <button type="button" id="btn-team-next" class="export-action-btn" title="Next team (Alt+Right)" aria-label="Next team" disabled>▶</button>
            <span id="team-pos-label" class="team-pos-label"></span>
            <div class="colour-key" aria-label="Registration colour key">
              <span class="key-chip chip-both" title="Registered in both the FA system and Thrive">✔ Both</span>
              <span class="key-chip chip-fa" title="Registered with the FA but not in Thrive">▲ FA only</span>
              <span class="key-chip chip-thrive" title="In Thrive but not registered with the FA">● Thrive only</span>
              <span class="key-chip chip-nofa" title="Thrive group with no FA team (U4-U6, training)">ℹ No FA needed</span>
              <span class="key-chip chip-unpaid" title="No active Thrive mandate, or not found in Thrive">✖ Not paying</span>
            </div>
          </div>
          <div class="team-status-row">
            <span class="unpaid-banner-count" id="team-unpaid-banner"></span>
            <span id="team-summary-text" class="team-summary-text"></span>
          </div>
          <div class="team-actions-row">
            <button type="button" id="btn-copy-mgr-phone" class="export-action-btn" disabled>Copy manager phone</button>
            <button type="button" id="btn-copy-asst-phone" class="export-action-btn" disabled>Copy assistant phone</button>
            <button type="button" id="btn-team-whatsapp" class="export-action-btn" disabled>Copy for WhatsApp...</button>
            <button type="button" id="btn-team-whatsapp-payment" class="export-action-btn" disabled>Copy payment for WhatsApp...</button>
            <button type="button" id="btn-export-one-team" class="export-action-btn" disabled>Export this team...</button>
            <button type="button" id="btn-team-export-all" class="export-action-btn" disabled>Export team files for managers (.zip)...</button>
          </div>
          <div class="table-toolbar">
            <div class="search-input-group">
              <label for="team-search">Search</label>
              <input type="search" id="team-search" placeholder="Name, phone, email, condition..." />
              <button type="button" id="team-search-clear" aria-label="Clear team search">✕</button>
            </div>
            <label class="checkbox-row">
              <input type="checkbox" id="chk-team-only-unpaid" />
              <span>Show only not paying</span>
            </label>
            <span class="toolbar-warn" id="team-filter-count"></span>
            <span class="toolbar-hint">Red bold rows = not paying. Red text = medical recorded. Click a player for full details.</span>
          </div>
          <div class="table-wrapper">
            <div class="placeholder-overlay" id="placeholder-teams">
              <div>
                <strong>Not reconciled yet</strong><br /><br />
                Choose your FA report and Thrive export in Step 1, then click Reconcile.
              </div>
            </div>
            <table class="data-table" id="table-teams" aria-label="Team sheet players">
              <thead id="thead-teams"></thead>
              <tbody id="tbody-teams"></tbody>
            </table>
          </div>
        </section>

        <!-- Panel 3: Not paying (#21) -->
        <section id="panel-not-paying" role="tabpanel" aria-labelledby="tab-btn-not-paying" class="tabpanel" hidden>
          <div class="panel-top-row">
            <p class="view-desc panel-top-desc">
              Players with no active Thrive mandate, plus players registered with the FA but not found in Thrive: the ones who will not be paying through Thrive. FA-only players may be in Thrive under another name, so check before you chase. Click a row for full details.
            </p>
            <div class="panel-top-actions">
              <button type="button" id="btn-np-left" class="export-action-btn" disabled title="Players who have left the club but are still in the FA report: taken out of this list, the team sheets, counts and the club PDF">Mark as left the club...</button>
              <button type="button" id="btn-np-paid" class="export-action-btn" disabled title="Players who pay the club directly, or have already paid in full: taken off this list and counted as paying. Paid in full shows exactly like an active Thrive direct debit">Paying outside Thrive...</button>
              <button type="button" id="btn-np-whatsapp" class="export-action-btn" disabled>Copy for WhatsApp...</button>
              <button type="button" id="btn-np-export" class="export-action-btn" disabled>Export this list...</button>
            </div>
          </div>
          <p class="toolbar-warn warn-block" id="np-mandate-warning"></p>
          <div class="table-toolbar">
            <div class="search-input-group">
              <label for="np-search">Search</label>
              <input type="search" id="np-search" placeholder="Name, team or contact..." />
              <button type="button" id="np-search-clear" aria-label="Clear not paying search">✕</button>
            </div>
            <span class="toolbar-warn" id="np-filter-count"></span>
            <span class="toolbar-hint">Click a column heading to sort. Click a row for full details.</span>
          </div>
          <div class="table-wrapper">
            <div class="placeholder-overlay" id="placeholder-np">
              <div>
                <strong>Not reconciled yet</strong><br /><br />
                Choose your FA report and Thrive export in Step 1, then click Reconcile.
              </div>
            </div>
            <table class="data-table" id="table-np" aria-label="Players not paying">
              <thead id="thead-np"></thead>
              <tbody id="tbody-np"></tbody>
            </table>
          </div>
        </section>

        <!-- Panel 4: Missing consents -->
        <section id="panel-consents" role="tabpanel" aria-labelledby="tab-btn-consents" class="tabpanel" hidden>
          <div class="panel-top-row">
            <p class="view-desc panel-top-desc">
              Players in Thrive who have not given a consent: photography, code of conduct or club rules. Blank, No, declined and similar answers are listed, with the answer shown so you can check it. Players without photography consent are listed first: tell their manager not to photograph them.
            </p>
            <button type="button" id="btn-cons-export" class="export-action-btn" disabled>Export this list...</button>
          </div>
          <p class="toolbar-warn warn-block" id="cons-unchecked-warning"></p>
          <div class="table-toolbar">
            <div class="search-input-group">
              <label for="cons-search">Search</label>
              <input type="search" id="cons-search" placeholder="Name, team or consent..." />
              <button type="button" id="cons-search-clear" aria-label="Clear consents search">✕</button>
            </div>
            <span class="toolbar-warn" id="cons-filter-count"></span>
            <span class="toolbar-hint">Click a column heading to sort. Click a row for full details.</span>
          </div>
          <div class="table-wrapper">
            <div class="placeholder-overlay" id="placeholder-cons">
              <div>
                <strong>Not reconciled yet</strong><br /><br />
                Choose your FA report and Thrive export in Step 1, then click Reconcile.
              </div>
            </div>
            <table class="data-table" id="table-cons" aria-label="Players missing consents">
              <thead id="thead-cons"></thead>
              <tbody id="tbody-cons"></tbody>
            </table>
          </div>
        </section>

        <!-- Panel: Coaches (FA Team Qualifications Report) -->
        <section id="panel-coaches" role="tabpanel" aria-labelledby="tab-btn-coaches" class="tabpanel" hidden>
          <p class="view-desc">
            Team officials from the FA Team Qualifications Report, with their First Aid, Safeguarding and DBS expiry, compared with your managers or club officials file. Each certificate is coloured by when it expires: red expired, light red within 1 month, orange 1 to 3 months, yellow 3 to 6 months, green 6 months or more, grey not held.
          </p>
          <div class="panel-top-row">
            <p class="toolbar-warn warn-block panel-top-desc" id="coach-summary"></p>
            <button type="button" id="btn-coach-officials-export" title="Downloads a copy of your managers / club officials file with the FA Team Qualifications Report merged in: FA teams people are missing, coaches only in the FA report, their FAN and FA roles. Nothing is removed.">Download updated officials file...</button>
          </div>
          <div class="table-toolbar">
            <label for="select-coach-filter">Show</label>
            <select id="select-coach-filter"></select>
            <div class="search-input-group">
              <label for="coach-search">Search</label>
              <input type="search" id="coach-search" placeholder="Name, team or qualification..." />
              <button type="button" id="coach-search-clear" aria-label="Clear coaches search">✕</button>
            </div>
            <span class="toolbar-warn" id="coach-filter-count"></span>
            <span class="toolbar-hint">Click a row for full details.</span>
          </div>
          <div class="table-wrapper">
            <div class="placeholder-overlay" id="placeholder-coaches">
              <div>
                <strong>No coaches yet</strong><br /><br />
                Choose the FA Team Qualifications Report in Step 1 (with or without the player files), then click Reconcile.
              </div>
            </div>
            <table class="data-table" id="table-coaches" aria-label="Coaches and their qualifications">
              <thead id="thead-coaches"></thead>
              <tbody id="tbody-coaches"></tbody>
            </table>
          </div>
        </section>

        <!-- Panel: Left the club -->
        <section id="panel-left" role="tabpanel" aria-labelledby="tab-btn-left" class="tabpanel" hidden>
          <div class="panel-top-row">
            <p class="view-desc panel-top-desc" id="left-note"></p>
            <div class="panel-top-actions">
              <button type="button" id="btn-left-clear">Clear marks no longer needed</button>
              <button type="button" id="btn-clubdata-export" title="Left the club marks and coach notes, encrypted with a passphrase, to move to another computer (this app or the Windows app)">Export club data (encrypted)...</button>
              <input type="file" id="input-clubdata-import" accept=".prdata,.json,application/json,text/plain,application/octet-stream" hidden />
              <button type="button" id="btn-clubdata-import" title="Open an encrypted club data file from another computer">Import club data...</button>
            </div>
          </div>
          <p class="toolbar-warn warn-block" id="left-info"></p>
          <div class="table-wrapper">
            <table class="data-table" id="table-left" aria-label="Players marked as left the club">
              <thead id="thead-left"></thead>
              <tbody id="tbody-left"></tbody>
            </table>
          </div>
        </section>

        <!-- Panel: Paying outside Thrive -->
        <section id="panel-paid" role="tabpanel" aria-labelledby="tab-btn-paid" class="tabpanel" hidden>
          <div class="panel-top-row">
            <p class="view-desc panel-top-desc" id="paid-note"></p>
            <div class="panel-top-actions">
              <button type="button" id="btn-paid-clear">Clear marks no longer needed</button>
            </div>
          </div>
          <p class="toolbar-warn warn-block" id="paid-info"></p>
          <div class="table-wrapper">
            <table class="data-table" id="table-paid" aria-label="Players marked as paying outside Thrive">
              <thead id="thead-paid"></thead>
              <tbody id="tbody-paid"></tbody>
            </table>
          </div>
        </section>

        <!-- Panel 5: Team mappings & settings storage (#22) -->
        <section id="panel-mappings" role="tabpanel" aria-labelledby="tab-btn-mappings" class="tabpanel" hidden>
          <p class="view-desc">
            Thrive and the FA name their teams differently. This list says which Thrive team matches which FA team. The defaults suit your current teams. To change one, click a row, choose the FA team below and click Apply. Choose (ignore) for Thrive groups with no FA team, such as training squads. Changes save automatically in your browser.
          </p>
          <p class="toolbar-warn warn-block" id="map-unmapped-warning"></p>
          <div class="table-wrapper">
            <table class="data-table" id="table-mappings" aria-label="Team mappings">
              <thead>
                <tr>
                  <th>Thrive team</th>
                  <th>FA team</th>
                  <th>Players in Thrive file</th>
                </tr>
              </thead>
              <tbody id="tbody-mappings"></tbody>
            </table>
          </div>
          <div class="mapping-controls">
            <div class="mapping-tools-bar">
              <label for="input-new-map-team">Add a Thrive team by name</label>
              <input type="text" id="input-new-map-team" class="map-new-team-input" placeholder="e.g. U14 Red" />
              <button type="button" id="btn-map-add">Add</button>
              <div class="map-tools-right">
                <button type="button" id="btn-map-suggest">Suggest for unmapped</button>
                <button type="button" id="btn-map-reset">Reset to defaults</button>
                <button type="button" id="btn-settings-export" title="Save your mappings and preferences to a file">Export settings...</button>
                <input type="file" id="input-settings-import" accept=".json,application/json,text/plain,application/octet-stream" hidden />
                <button type="button" id="btn-settings-import" title="Load mappings and preferences from a file">Import settings...</button>
              </div>
            </div>
            <div class="mapping-edit-bar">
              <span>Thrive team:</span>
              <strong id="map-selected-label" class="map-selected-label">(none selected)</strong>
              <label for="select-map-target">matches FA team</label>
              <select id="select-map-target" class="map-target-select"></select>
              <button type="button" id="btn-map-apply" class="btn-primary btn-compact">Apply</button>
              <button type="button" id="btn-map-remove">Remove row</button>
            </div>
          </div>
        </section>
      </main>

      <footer class="status-footer" role="contentinfo">
        <span id="status-bar-text">Version ${rc.VERSION} (created ${rc.BUILD_DATETIME})   |   Not reconciled yet</span>
        <span>100% client-side — your data never leaves your computer</span>
      </footer>

      <!-- Modal Backdrop -->
      <div class="modal-backdrop" id="modal-backdrop" hidden>
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 id="modal-title">Details</h2>
            <button type="button" id="modal-close-top" aria-label="Close dialog">✕</button>
          </div>
          <div class="modal-body" id="modal-body"></div>
          <div class="modal-footer" id="modal-footer"></div>
        </div>
      </div>
    `;

    const bannerP = this.root.querySelector('#banner-text') as HTMLElement;
    bannerP.textContent = BANNER_TEXT;

    const chkMedical = this.root.querySelector('#chk-medical') as HTMLInputElement;
    chkMedical.checked = this.settings.medical;

    const inputFuzzy = this.root.querySelector('#input-fuzzy') as HTMLInputElement;
    inputFuzzy.value = this.settings.fuzzy.toFixed(2);
    const inputFuzzyMobile = this.root.querySelector('#input-fuzzy-mobile') as HTMLInputElement;
    inputFuzzyMobile.value = this.settings.fuzzy.toFixed(2);

    this.bindEvents();
  }

  private bindEvents(): void {
    // Header & Banner buttons
    this.root.querySelector('#nav-help-quick')?.addEventListener('click', () => this.showHelp('quick'));
    this.root.querySelector('#nav-help-exports')?.addEventListener('click', () => this.showHelp('exports'));
    this.root.querySelector('#nav-help-privacy')?.addEventListener('click', () => this.showHelp('privacy'));
    this.root.querySelector('#banner-privacy-btn')?.addEventListener('click', () => this.showHelp('privacy'));
    this.root.querySelector('#step1-howto-link')?.addEventListener('click', () => this.showHelp('exports'));
    this.root.querySelector('#nav-about')?.addEventListener('click', () => this.showAbout());

    // File pickers & drag-and-drop (#18)
    this.setupFileSlot('fa', (file) => {
      this.faFile = file;
      this.onFilesModified();
    });
    this.setupFileSlot('thrive', (file) => {
      this.thriveFile = file;
      this.onFilesModified();
    });
    this.setupFileSlot('staff', (file) => {
      this.staffFile = file;
      this.staffRemembered = false;
      if (staffStore.isRememberOn(this.storage)) {
        this.saveRememberedStaff();
      }
      this.onFilesModified();
    });
    this.setupFileSlot('qual', (file) => {
      this.qualFile = file;
      this.onFilesModified();
    });
    const coachFilter = this.root.querySelector('#select-coach-filter') as HTMLSelectElement;
    for (const name of COACH_FILTERS) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      coachFilter.appendChild(opt);
    }
    coachFilter.addEventListener('change', () => {
      this.coachFilter = coachFilter.value;
      void this.renderCoachesTab();
    });
    this.root.querySelector('#btn-np-left')?.addEventListener('click', () => this.openMarkLeftModal());
    this.root.querySelector('#btn-np-paid')?.addEventListener('click', () => this.openMarkPaidModal());
    this.root.querySelector('#btn-paid-clear')?.addEventListener('click', () => {
      const found = new Set(this.paidRows.map(clubData.paid_id));
      const marks = this.clubData.paid_outside || [];
      const stale = marks.filter((m) => !found.has(m.id)).length;
      if (!stale || !this.result) {
        this.showMessageModal('Nothing to clear', 'Every mark is for a player still in the files.');
        return;
      }
      this.openConfirmModal('Clear marks', `Forget ${stale} mark(s) for players who are not in these files any more?`, () => {
        this.clubData.paid_outside = marks.filter((m) => found.has(m.id));
        clubData.saveClubData(this.storage, this.clubData);
        this.renderPaidTab();
      });
    });
    this.root.querySelector('#btn-left-clear')?.addEventListener('click', () => {
      const found = new Set(this.leftRows.map(clubData.left_id));
      const stale = this.clubData.left_players.filter((m) => !found.has(m.id)).length;
      if (!stale || !this.result) {
        this.showMessageModal('Nothing to clear', 'Every mark is for a player still in the files.');
        return;
      }
      this.openConfirmModal('Clear marks', `Forget ${stale} mark(s) for players who are not in these files any more?`, () => {
        this.clubData.left_players = this.clubData.left_players.filter((m) => found.has(m.id));
        clubData.saveClubData(this.storage, this.clubData);
        this.renderLeftTab();
      });
    });
    this.root.querySelector('#btn-clubdata-export')?.addEventListener('click', () => this.exportClubData());
    const clubImport = this.root.querySelector('#input-clubdata-import') as HTMLInputElement;
    this.root.querySelector('#btn-clubdata-import')?.addEventListener('click', () => {
      clubImport.value = '';
      clubImport.click();
    });
    clubImport.addEventListener('change', async () => {
      const f = clubImport.files?.[0];
      if (f) this.importClubData(await f.text());
    });
    this.root.querySelector('#btn-coach-officials-export')?.addEventListener('click', () => {
      void this.exportUpdatedOfficials();
    });
    const coachSearch = this.root.querySelector('#coach-search') as HTMLInputElement;
    coachSearch.addEventListener('input', () => {
      this.coachSearch = coachSearch.value;
      void this.renderCoachesTab();
    });
    this.root.querySelector('#coach-search-clear')?.addEventListener('click', () => {
      coachSearch.value = '';
      this.coachSearch = '';
      void this.renderCoachesTab();
    });
    this.root.querySelector('#chk-remember-staff')?.addEventListener('change', (e) => {
      if ((e.target as HTMLInputElement).checked) {
        this.saveRememberedStaff();
      } else {
        staffStore.forgetStaff(this.storage);
        this.staffRemembered = false;
        this.setStatus('The managers list is no longer remembered on this device.');
      }
      this.updateFileSlotsUI();
    });

    this.root.querySelector('#btn-staff-template')?.addEventListener('click', async () => {
      const bytes = await (await loadExcelIo()).buildStaffTemplateBuffer();
      downloadBlob(
        bytes,
        'Managers_template.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      this.setStatus('Downloaded Managers_template.xlsx');
    });

    // Step 2: Reconcile + collapsible steps bar (mobile & desktop)
    this.root.querySelector('#btn-reconcile')?.addEventListener('click', () => {
      void this.runReconcile();
    });
    this.root.querySelector('#btn-reconcile-compact')?.addEventListener('click', () => {
      void this.runReconcile();
    });
    this.root.querySelector('#btn-expand-steps')?.addEventListener('click', () => {
      this.setStepsCollapsed(false);
    });
    this.root.querySelector('#btn-collapse-steps')?.addEventListener('click', () => {
      this.setStepsCollapsed(true);
    });

    // Step 3: Share & medical toggle
    this.root.querySelector('#chk-medical')?.addEventListener('change', (e) => {
      this.settings.medical = (e.target as HTMLInputElement).checked;
      this.persistSettings();
      this.renderTeamTab();
    });
    this.root.querySelector('#btn-export-full')?.addEventListener('click', () => {
      void this.exportFullWorkbook();
    });
    this.root.querySelector('#btn-export-teams-zip')?.addEventListener('click', () => {
      void this.exportEachTeamZip();
    });
    this.root.querySelector('#btn-export-club-pdf')?.addEventListener('click', () => {
      this.exportClubPdf();
    });

    // Tab switching
    this.root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.tab as typeof this.activeTab;
        if (tab) this.switchTab(tab);
      });
    });

    // Results sidebar, mobile view dropdown & fuzziness & search
    const inputFuzzy = this.root.querySelector('#input-fuzzy') as HTMLInputElement;
    const inputFuzzyMobile = this.root.querySelector('#input-fuzzy-mobile') as HTMLInputElement;
    const onFuzzyChange = (sourceInput: HTMLInputElement) => {
      const raw = parseFloat(sourceInput.value);
      const val = Number.isNaN(raw) ? rc.DEFAULT_FUZZY : Math.min(1.0, Math.max(0.6, Math.round(raw * 100) / 100));
      inputFuzzy.value = val.toFixed(2);
      inputFuzzyMobile.value = val.toFixed(2);
      if (val !== this.settings.fuzzy) {
        this.settings.fuzzy = val;
        this.persistSettings();
        this.recompute();
      }
    };
    inputFuzzy.addEventListener('change', () => onFuzzyChange(inputFuzzy));
    inputFuzzyMobile.addEventListener('change', () => onFuzzyChange(inputFuzzyMobile));

    const selectMobileView = this.root.querySelector('#select-mobile-view') as HTMLSelectElement;
    selectMobileView.addEventListener('change', () => {
      this.currentView = selectMobileView.value;
      this.renderResultsSidebar();
      this.renderResultsTable();
    });

    const resSearch = this.root.querySelector('#results-search') as HTMLInputElement;
    resSearch.addEventListener('input', () => {
      this.resultsSearch = resSearch.value;
      this.renderResultsTable();
    });
    this.root.querySelector('#results-search-clear')?.addEventListener('click', () => {
      resSearch.value = '';
      this.resultsSearch = '';
      this.renderResultsTable();
    });

    // Team sheets controls (#20)
    const selectTeam = this.root.querySelector('#select-team') as HTMLSelectElement;
    selectTeam.addEventListener('change', () => {
      this.settings.team = selectTeam.value;
      this.persistSettings();
      this.renderTeamTab();
    });
    this.root.querySelector('#btn-team-prev')?.addEventListener('click', () => this.stepTeam(-1));
    this.root.querySelector('#btn-team-next')?.addEventListener('click', () => this.stepTeam(1));

    const teamSearch = this.root.querySelector('#team-search') as HTMLInputElement;
    teamSearch.addEventListener('input', () => {
      this.teamSearch = teamSearch.value;
      this.renderTeamTab();
    });
    this.root.querySelector('#team-search-clear')?.addEventListener('click', () => {
      teamSearch.value = '';
      this.teamSearch = '';
      this.renderTeamTab();
    });
    this.root.querySelector('#chk-team-only-unpaid')?.addEventListener('change', (e) => {
      this.teamOnlyUnpaid = (e.target as HTMLInputElement).checked;
      this.renderTeamTab();
    });
    this.root.querySelector('#btn-copy-mgr-phone')?.addEventListener('click', () => this.copyStaffPhone('manager'));
    this.root.querySelector('#btn-copy-asst-phone')?.addEventListener('click', () => this.copyStaffPhone('assistant'));
    this.root.querySelector('#btn-team-whatsapp')?.addEventListener('click', () => this.openTeamWhatsAppModal());
    this.root.querySelector('#btn-team-whatsapp-payment')?.addEventListener('click', () => this.openTeamPaymentWhatsAppModal());
    this.root.querySelector('#btn-export-one-team')?.addEventListener('click', () => {
      void this.exportCurrentTeam();
    });
    this.root.querySelector('#btn-team-export-all')?.addEventListener('click', () => {
      void this.exportEachTeamZip();
    });

    // Not paying controls (#21)
    const npSearch = this.root.querySelector('#np-search') as HTMLInputElement;
    npSearch.addEventListener('input', () => {
      this.npSearch = npSearch.value;
      this.renderNotPayingTab();
    });
    this.root.querySelector('#np-search-clear')?.addEventListener('click', () => {
      npSearch.value = '';
      this.npSearch = '';
      this.renderNotPayingTab();
    });
    this.root.querySelector('#btn-np-whatsapp')?.addEventListener('click', () => this.openNotPayingWhatsAppModal());
    this.root.querySelector('#btn-np-export')?.addEventListener('click', () => {
      void this.exportNotPayingList();
    });

    // Missing consents controls
    const consSearch = this.root.querySelector('#cons-search') as HTMLInputElement;
    consSearch.addEventListener('input', () => {
      this.consSearch = consSearch.value;
      this.renderConsentsTab();
    });
    this.root.querySelector('#cons-search-clear')?.addEventListener('click', () => {
      consSearch.value = '';
      this.consSearch = '';
      this.renderConsentsTab();
    });
    this.root.querySelector('#btn-cons-export')?.addEventListener('click', () => {
      void this.exportConsentsList();
    });

    // Team mappings & settings controls (#22)
    this.root.querySelector('#btn-map-apply')?.addEventListener('click', () => this.applySelectedMapping());
    this.root.querySelector('#btn-map-remove')?.addEventListener('click', () => this.removeSelectedMapping());
    this.root.querySelector('#btn-map-add')?.addEventListener('click', () => this.addNewMappingTeam());
    this.root.querySelector('#btn-map-suggest')?.addEventListener('click', () => this.suggestUnmappedTeams(false));
    this.root.querySelector('#btn-map-reset')?.addEventListener('click', () => {
      this.openConfirmModal(
        'Reset team mappings',
        'Replace your team mappings with the built-in defaults?',
        () => {
          this.settings.team_map = { ...rc.DEFAULT_TEAM_MAP };
          this.onMappingChanged();
        }
      );
    });

    this.root.querySelector('#btn-settings-export')?.addEventListener('click', () => {
      const json = settingsMod.serializeSettingsForExport(this.settings);
      downloadBlob(json, `PlayerReconcile_settings_${todayIsoDate()}.json`, 'application/json');
      this.setStatus('Exported settings JSON.');
    });
    const importInput = this.root.querySelector('#input-settings-import') as HTMLInputElement;
    this.root.querySelector('#btn-settings-import')?.addEventListener('click', () => {
      importInput.value = '';
      importInput.click();
    });
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = settingsMod.parseImportedSettings(text);
        this.settings = imported;
        this.persistSettings();
        (this.root.querySelector('#chk-medical') as HTMLInputElement).checked = this.settings.medical;
        (this.root.querySelector('#input-fuzzy') as HTMLInputElement).value = this.settings.fuzzy.toFixed(2);
        (this.root.querySelector('#input-fuzzy-mobile') as HTMLInputElement).value = this.settings.fuzzy.toFixed(2);
        this.recompute();
        this.renderMappingsTab();
        this.setStatus(`Imported settings from ${file.name}`);
      } catch (exc) {
        this.showMessageModal(
          'Could not import settings',
          exc instanceof Error ? exc.message : String(exc)
        );
      }
    });

    // Modal close
    this.root.querySelector('#modal-close-top')?.addEventListener('click', () => this.closeModal());
    this.root.querySelector('#modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget && !this.busy) {
        this.closeModal();
      }
    });
  }

  private bindGlobalShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        this.trapModalFocus(e);
      } else if (e.key === 'Escape' && !this.busy) {
        const backdrop = this.root.querySelector('#modal-backdrop') as HTMLElement;
        if (backdrop && !backdrop.hidden) {
          this.closeModal();
        }
      } else if (e.key === 'F1') {
        e.preventDefault();
        this.showHelp('quick');
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'r' &&
        this.thriveFile &&
        !isEditableTarget(e.target)
      ) {
        // Ctrl+R reconciles once the Thrive export is chosen (reloading would lose it).
        // Before that, or while typing, the browser's normal reload is left alone.
        e.preventDefault();
        void this.runReconcile();
      } else if (e.altKey && e.key === 'ArrowLeft' && this.activeTab === 'teams') {
        e.preventDefault();
        this.stepTeam(-1);
      } else if (e.altKey && e.key === 'ArrowRight' && this.activeTab === 'teams') {
        e.preventDefault();
        this.stepTeam(1);
      }
    });
  }

  private setupFileSlot(
    slot: 'fa' | 'thrive' | 'staff' | 'qual',
    onChange: (file: ChosenFile | null) => void
  ): void {
    const dropRow = this.root.querySelector(`#drop-${slot}`) as HTMLElement;
    const statusBox = this.root.querySelector(`#status-${slot}`) as HTMLElement;
    const input = this.root.querySelector(`#input-${slot}`) as HTMLInputElement;
    const browseBtn = this.root.querySelector(`#browse-${slot}`) as HTMLButtonElement;
    const clearBtn = this.root.querySelector(`#clear-${slot}`) as HTMLButtonElement;

    const loadDomFile = async (f: File) => {
      const buffer = await f.arrayBuffer();
      onChange({ name: f.name, buffer });
    };

    browseBtn.addEventListener('click', () => { input.value = ''; input.click(); });
    statusBox.addEventListener('click', () => { input.value = ''; input.click(); });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) void loadDomFile(f);
    });
    clearBtn.addEventListener('click', () => {
      input.value = '';
      onChange(null);
    });

    dropRow.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropRow.classList.add('drag-over');
    });
    dropRow.addEventListener('dragleave', () => {
      dropRow.classList.remove('drag-over');
    });
    dropRow.addEventListener('drop', (e) => {
      e.preventDefault();
      dropRow.classList.remove('drag-over');
      const f = e.dataTransfer?.files?.[0];
      if (f) void loadDomFile(f);
    });
  }

  private restoreRememberedStaff(): void {
    const chk = this.root.querySelector('#chk-remember-staff') as HTMLInputElement;
    chk.checked = staffStore.isRememberOn(this.storage);
    const saved = staffStore.loadRememberedStaff(this.storage);
    if (saved) {
      this.staffFile = { name: saved.name, buffer: saved.buffer };
      this.staffRemembered = true;
    }
    this.updateFileSlotsUI();
  }

  private saveRememberedStaff(): void {
    const err = staffStore.rememberStaff(this.storage, this.staffFile, rc.formatDate(rc.todayLocalDate()));
    if (err) {
      this.showMessageModal('Managers list not remembered', err);
      return;
    }
    if (this.staffFile) {
      this.staffRemembered = true;
      this.setStatus(`The managers list ${this.staffFile.name} will be remembered on this device.`);
    } else {
      this.setStatus('The next managers file you choose will be remembered on this device.');
    }
  }

  public setChosenFilesForTest(
    fa: ChosenFile | null,
    thrive: ChosenFile | null,
    staff: ChosenFile | null = null,
    qual: ChosenFile | null = null
  ): void {
    this.faFile = fa;
    this.thriveFile = thrive;
    this.staffFile = staff;
    this.qualFile = qual;
    this.onFilesModified();
  }

  private updateFileSlotsUI(): void {
    const slots: Array<['fa' | 'thrive' | 'staff' | 'qual', ChosenFile | null, string]> = [
      ['fa', this.faFile, 'No file chosen (tap or drop .xlsx)'],
      ['thrive', this.thriveFile, 'No file chosen (tap or drop .xlsx)'],
      ['staff', this.staffFile, 'Optional (.xlsx or .csv)'],
      ['qual', this.qualFile, 'Optional: Team Qualifications Report'],
    ];
    for (const [id, file, emptyText] of slots) {
      const statusBox = this.root.querySelector(`#status-${id}`) as HTMLElement;
      const clearBtn = this.root.querySelector(`#clear-${id}`) as HTMLButtonElement;
      if (file) {
        statusBox.textContent =
          id === 'staff' && this.staffRemembered ? `${file.name} (remembered)` : file.name;
        statusBox.classList.add('has-file');
        clearBtn.hidden = false;
      } else {
        statusBox.textContent = emptyText;
        statusBox.classList.remove('has-file');
        clearBtn.hidden = true;
      }
    }
  }

  private onFilesModified(): void {
    this.updateFileSlotsUI();
    if (this.runFilesKey && !this.busy) {
      const nowKey = this.currentFilesSignature();
      if (nowKey !== this.runFilesKey) {
        const stateLbl = this.root.querySelector('#run-state-label') as HTMLElement;
        stateLbl.textContent = 'Files changed: click Reconcile again';
        stateLbl.className = 'run-state-text warn';
        this.setHint(
          'You have chosen different files. The results below are from the previous files until you click Reconcile again.'
        );
      }
    }
  }

  /** Re-rendering a table replaces its headings, so put keyboard focus back on the one just used. */
  private focusSortedHeader(theadSelector: string, index: number): void {
    const th = this.root.querySelectorAll(`${theadSelector} th`)[index] as HTMLElement | undefined;
    th?.focus();
  }

  /** Copy text and report honestly whether it worked (with a fallback for older browsers). */
  private async copyText(text: string, okMessage: string): Promise<boolean> {
    let ok = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'offscreen-copy';
      const host = (this.root.querySelector('#modal-backdrop:not([hidden])') as HTMLElement) || document.body;
      host.appendChild(ta);
      ta.select();
      try {
        ok = typeof document.execCommand === 'function' && document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
    }
    this.setStatus(
      ok ? okMessage : 'Could not copy automatically. Select the text, press Ctrl+C (or long-press and Copy), then paste it.'
    );
    return ok;
  }

  private setHint(msg: string): void {
    const el = this.root.querySelector('#hint-banner') as HTMLElement;
    if (el) el.textContent = msg;
  }

  private setStatus(msg: string): void {
    const el = this.root.querySelector('#status-bar-text') as HTMLElement;
    if (el) el.textContent = msg;
  }

  public switchTab(tab: typeof this.activeTab): void {
    this.activeTab = tab;
    this.root.querySelectorAll('.tab-btn').forEach((btn) => {
      const isTarget = (btn as HTMLElement).dataset.tab === tab;
      btn.setAttribute('aria-selected', String(isTarget));
    });
    const panels: Array<typeof this.activeTab> = [
      'results',
      'teams',
      'not-paying',
      'consents',
      'coaches',
      'left',
      'paid',
      'mappings',
    ];
    for (const p of panels) {
      const panelEl = this.root.querySelector(`#panel-${p}`) as HTMLElement;
      if (panelEl) panelEl.hidden = p !== tab;
    }
  }

  // ------------------------------------------------------------------ Reconcile (#18)

  public async runReconcile(): Promise<void> {
    if (!this.faFile && !this.thriveFile && this.qualFile) {
      await this.runCoachesOnly();
      return;
    }
    if (!this.faFile && !this.thriveFile) {
      this.showMessageModal(
        'Choose your files',
        'Please choose the Thrive data export first. The FA registration report is optional: without it, FA registration is not checked.\n\nTo check coaches only, choose just the FA qualifications report.'
      );
      return;
    }
    if (this.busy) return;
    this.busy = true;
    this.openProgressModal();

    const input: ReconcileInput = {
      faBuffer: this.faFile?.buffer ?? null,
      faName: this.faFile?.name ?? '',
      thriveBuffer: this.thriveFile?.buffer ?? null,
      thriveName: this.thriveFile?.name ?? '',
      staffBuffer: this.staffFile?.buffer ?? null,
      staffName: this.staffFile?.name ?? '',
    };

    try {
      const loaded = await this.executeFileLoading(input);
      this.updateProgressStep(4); // Matching players

      this.missingItems = loaded.missingItems;
      this.faPlayers = loaded.faPlayers;
      this.thrivePlayers = loaded.thrivePlayers;
      this.staff = loaded.staff;

      if (loaded.swapped) {
        const tmp = this.faFile;
        this.faFile = this.thriveFile;
        this.thriveFile = tmp;
        this.updateFileSlotsUI();
      }

      const addedCount = this.suggestUnmappedTeams(true);
      const computed = this.computeResult();
      this.updateProgressStep(5); // Building team sheets and lists

      this.busy = false;
      this.closeModal();
      this.applyResult(computed);
      await this.loadCoaches();
      this.afterRunMessages(loaded, addedCount);
    } catch (exc) {
      this.busy = false;
      this.closeModal();
      const msg =
        exc instanceof rc.ReportError
          ? `${exc.message}\n\nCheck each file is in the right box. Help > Getting the exports has the full steps.`
          : exc instanceof Error
            ? exc.message
            : String(exc);
      this.showMessageModal('Could not reconcile', msg);
    }
  }

  /** Read the FA qualifications report (if chosen) and compare it with the managers / officials file. */
  private async loadCoaches(): Promise<boolean> {
    this.coaches = null;
    if (this.qualFile) {
      try {
        const [excelIo, coachesMod, clubPdf] = await Promise.all([
          loadExcelIo(), import('./coaches'), import('./club_pdf'),
        ]);
        const report = coachesMod.parse_qualifications(
          await excelIo.readWorkbookSheets(this.qualFile.buffer, this.qualFile.name)
        );
        let officials: import('./club_pdf').Official[] = [];
        if (this.staffFile) {
          try {
            officials = clubPdf.parse_officials(
              await excelIo.readWorkbookSheets(this.staffFile.buffer, this.staffFile.name)
            );
          } catch {
            officials = [];
          }
        }
        if (!officials.length && this.result) officials = clubPdf.officials_from_staff(this.result);
        this.coaches = coachesMod.reconcile_coaches(report, officials);
        // notes in the officials file's Notes column fill in coaches who have no note in the app yet
        const [notes, taken] = clubData.import_file_notes(this.clubData.coach_notes, officials, this.coaches.coaches,
          coachesMod.same_person);
        if (taken) {
          this.clubData.coach_notes = notes;
          clubData.saveClubData(this.storage, this.clubData);
        }
      } catch (exc) {
        this.showMessageModal('FA qualifications report not used', exc instanceof Error ? exc.message : String(exc));
      }
    }
    await this.renderCoachesTab();
    return this.coaches !== null;
  }

  /** Reconcile with only the FA qualifications report (no player files). */
  private async runCoachesOnly(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const ok = await this.loadCoaches();
    this.busy = false;
    if (!ok || !this.coaches) return;
    this.runFilesKey = this.currentFilesSignature();
    const now = new Date();
    const stateLbl = this.root.querySelector('#run-state-label') as HTMLElement;
    stateLbl.textContent = `Last run ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    stateLbl.className = 'run-state-text ok';
    const pdfBtn = this.root.querySelector('#btn-export-club-pdf') as HTMLButtonElement | null;
    if (pdfBtn) pdfBtn.disabled = false;
    this.switchTab('coaches');
    this.setHint(
      `Coaches only: read ${this.coaches.coaches.length} team officials from the FA qualifications report. Choose the Thrive export too to check players.`
    );
    this.setStatus(`Coaches checked at ${rc.formatDate(rc.todayLocalDate())}   |   ${this.qualFile?.name || ''}`);
  }

  private async renderCoachesTab(): Promise<void> {
    const tabBtn = this.root.querySelector('#tab-btn-coaches') as HTMLElement;
    const summaryEl = this.root.querySelector('#coach-summary') as HTMLElement;
    const thead = this.root.querySelector('#thead-coaches') as HTMLElement;
    const tbody = this.root.querySelector('#tbody-coaches') as HTMLElement;
    const countEl = this.root.querySelector('#coach-filter-count') as HTMLElement;
    const placeholder = this.root.querySelector('#placeholder-coaches') as HTMLElement;
    thead.innerHTML = '';
    tbody.innerHTML = '';
    if (!this.coaches) {
      tabBtn.textContent = 'Coaches';
      summaryEl.textContent = '';
      countEl.textContent = '';
      placeholder.hidden = false;
      return;
    }
    placeholder.hidden = true;
    const coachesMod = await import('./coaches');
    const res = this.coaches;
    const [headers, rows] = coachesMod.coach_rows(res, this.coachFilter);
    const term = this.coachSearch.trim().toLowerCase();
    const shown = term ? rows.filter(([vals]) => vals.join(' ').toLowerCase().includes(term)) : rows;
    const action = res.coaches.filter((c) => coachesMod.coach_matches(c, coachesMod.FILTERS[1], rc.todayLocalDate()));
    tabBtn.textContent = action.length ? `Coaches (${action.length} to action)` : 'Coaches';
    const totals = Object.fromEntries(coachesMod.coaches_totals(res));
    const parts = [
      `${res.coaches.length} team officials: ${totals['Expired']} expired, ${totals['Not held']} not held, ` +
        `${totals['Expires within 1 month']} expire within 1 month, ${totals['Expires in 1 to 3 months']} in 1 to 3 ` +
        `months, ${totals['Expires in 3 to 6 months']} in 3 to 6 months, ` +
        `${totals['All three in date for 6 months or more']} all in date for 6 months or more`,
    ];
    const incomplete = res.teams.filter((t) => t.complete.toLowerCase() === 'incomplete').map((t) => t.team);
    if (incomplete.length) parts.push(`FA says no qualified coach/manager for: ${incomplete.join(', ')}`);
    if (res.officials_checked) {
      if (res.not_in_fa.length) {
        parts.push('In the officials file but not the FA report: ' +
          res.not_in_fa.map(([n, , t]) => `${n} (${t})`).join(', '));
      }
    } else {
      parts.push('Choose a managers or club officials file to check it against the FA report');
    }
    summaryEl.textContent = parts.join('.  ') + '.';
    countEl.textContent = shown.length !== res.coaches.length ? `Showing ${shown.length} of ${res.coaches.length}` : '';
    const trHead = document.createElement('tr');
    for (const h of [...headers, 'Note', 'Reminder']) {
      const th = document.createElement('th');
      th.textContent = h;
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    const today = rc.todayLocalDate();
    const byName = new Map(res.coaches.map((c) => [c.name, c]));
    for (const [vals, band] of shown) {
      const tr = document.createElement('tr');
      tr.dataset.band = band;
      tr.tabIndex = 0;
      const coach = byName.get(vals[0]);
      vals.forEach((v, i) => {
        const td = document.createElement('td');
        td.textContent = v;
        // each certificate cell in its own band colour; the next action in the coach's most urgent band
        const certIndex = i - 4;
        const cellBand = coach && certIndex >= 0 && certIndex < coachesMod.CERTS.length
          ? coachesMod.cert_window(coach.certs[coachesMod.CERTS[certIndex][0]], today)
          : i === 7 ? band : '';
        if (cellBand && WINDOW_COLOURS[cellBand]) {
          td.style.backgroundColor = WINDOW_COLOURS[cellBand];
          td.style.color = '#1a1a1a';
        }
        tr.appendChild(td);
      });
      const tdNote = document.createElement('td');
      if (coach) {
        const note = clubData.note_for(this.clubData.coach_notes, coach);
        const span = document.createElement('span');
        span.textContent = note;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = note ? 'Edit...' : 'Add note...';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openCoachNote(coach);
        });
        tdNote.append(span, document.createTextNode(' '), btn);
      }
      tr.appendChild(tdNote);
      const tdRemind = document.createElement('td');
      if (coach && coachesMod.needs_reminder(coach, today)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-whatsapp-send';
        btn.textContent = 'WhatsApp...';
        btn.title = `A reminder for ${coach.name} saying what is expiring, ready to send on WhatsApp`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openCoachReminder(coach, coachesMod.reminder_message(coach, today));
        });
        tdRemind.appendChild(btn);
      }
      tr.appendChild(tdRemind);
      const open = () => this.openRowDetailModal(headers, vals);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
      tbody.appendChild(tr);
    }
  }

  private saveClubDataAndRecompute(message: string): void {
    clubData.saveClubData(this.storage, this.clubData);
    this.recompute();
    this.renderLeftTab();
    this.setStatus(message);
  }

  /** Choose players (on the not paying list) who have left the club but are still in the FA report. */
  private openMarkLeftModal(): void {
    if (!this.result) return;
    const [, npRows] = rc.not_paying_report(this.result);
    const today = rc.todayLocalDate();
    const candidates = this.result.rows.filter((r) => npRows.some(([v]) => {
      const [name, dob] = rc._name_dob(r, today);
      return v[0] === name && rc.formatDate(v[1] as rc.LocalDate | null) === rc.formatDate(dob);
    }));
    const body = document.createElement('div');
    const desc = document.createElement('p');
    desc.className = 'view-desc';
    desc.textContent = 'Tick the players who have left the club. They are taken out of the results, team sheets, the not paying list, counts and the club PDF, and listed on the Left the club tab, where you can undo it. Only a one-way code is stored in this browser, not their name.';
    body.appendChild(desc);
    const list = document.createElement('div');
    list.className = 'left-pick-list';
    const boxes: Array<[HTMLInputElement, rc.Row]> = [];
    for (const r of candidates) {
      const label = document.createElement('label');
      label.className = 'checkbox-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      const span = document.createElement('span');
      const [name] = rc._name_dob(r, today);
      span.textContent = `${name} (${r.fa_teams || r.thrive_teams || 'no team'}${r.fa ? ', FAN ' + r.fa.fan_id : ''})`;
      label.append(box, span);
      list.appendChild(label);
      boxes.push([box, r]);
    }
    if (!candidates.length) list.textContent = 'Nobody is on the not paying list.';
    body.appendChild(list);
    const footer = document.createElement('div');
    footer.className = 'modal-footer-right';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.closeModal());
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn-primary';
    ok.textContent = 'Mark as left';
    ok.addEventListener('click', () => {
      const chosen = boxes.filter(([b]) => b.checked).map(([, r]) => r);
      this.closeModal();
      if (!chosen.length) return;
      for (const r of chosen) this.clubData.left_players = clubData.mark(this.clubData.left_players, r);
      this.saveClubDataAndRecompute(`${chosen.length} player(s) marked as left the club. See the Left the club tab.`);
    });
    footer.append(cancel, ok);
    this.openCustomModal('Mark as left the club', body, footer);
  }

  /** Choose players (on the not paying list) who pay the club directly or have already paid in full. */
  private openMarkPaidModal(): void {
    if (!this.result) return;
    const [, npRows] = rc.not_paying_report(this.result);
    const today = rc.todayLocalDate();
    const candidates = this.result.rows.filter((r) => npRows.some(([v]) => {
      const [name, dob] = rc._name_dob(r, today);
      return v[0] === name && rc.formatDate(v[1] as rc.LocalDate | null) === rc.formatDate(dob);
    }));
    const body = document.createElement('div');
    const desc = document.createElement('p');
    desc.className = 'view-desc';
    desc.textContent = 'Tick the players who pay outside Thrive. They are taken off the not paying list and messages and counted as paying, and listed on the Paying outside Thrive tab, where you can undo it. Only a one-way code is stored in this browser, not their name.';
    body.appendChild(desc);
    const kinds = document.createElement('fieldset');
    kinds.className = 'paid-kind';
    const legend = document.createElement('legend');
    legend.textContent = 'They...';
    kinds.appendChild(legend);
    const radios: Array<[HTMLInputElement, clubData.PaidKind]> = [];
    for (const [kind, text] of [
      ['direct', 'Pay the club directly (shown as "Yes (pays the club directly)")'],
      ['full', 'Have paid in full (shown exactly as if set up with an active Thrive direct debit)'],
    ] as Array<[clubData.PaidKind, string]>) {
      const label = document.createElement('label');
      label.className = 'checkbox-row';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'paid-kind';
      radio.checked = kind === 'direct';
      const span = document.createElement('span');
      span.textContent = text;
      label.append(radio, span);
      kinds.appendChild(label);
      radios.push([radio, kind]);
    }
    body.appendChild(kinds);
    const list = document.createElement('div');
    list.className = 'left-pick-list';
    const boxes: Array<[HTMLInputElement, rc.Row]> = [];
    for (const r of candidates) {
      const label = document.createElement('label');
      label.className = 'checkbox-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      const span = document.createElement('span');
      const [name] = rc._name_dob(r, today);
      span.textContent = `${name} (${r.fa_teams || r.thrive_teams || 'no team'}${r.fa ? ', FAN ' + r.fa.fan_id : ''})`;
      label.append(box, span);
      list.appendChild(label);
      boxes.push([box, r]);
    }
    if (!candidates.length) list.textContent = 'Nobody is on the not paying list.';
    body.appendChild(list);
    const footer = document.createElement('div');
    footer.className = 'modal-footer-right';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.closeModal());
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn-primary';
    ok.textContent = 'Mark as paying';
    ok.addEventListener('click', () => {
      const chosen = boxes.filter(([b]) => b.checked).map(([, r]) => r);
      const kind = (radios.find(([r]) => r.checked) || radios[0])[1];
      this.closeModal();
      if (!chosen.length) return;
      for (const r of chosen) {
        this.clubData.paid_outside = clubData.mark_paid(this.clubData.paid_outside || [], r, kind);
      }
      this.saveClubDataAndRecompute(`${chosen.length} player(s) marked as ${clubData.PAID_KINDS[kind].toLowerCase()}. See the Paying outside Thrive tab.`);
    });
    footer.append(cancel, ok);
    this.openCustomModal('Paying outside Thrive', body, footer);
  }

  private renderPaidTab(): void {
    const tabBtn = this.root.querySelector('#tab-btn-paid') as HTMLElement | null;
    if (!tabBtn) return;
    const marks = this.clubData.paid_outside || [];
    (this.root.querySelector('#paid-note') as HTMLElement).textContent = clubData.PAID_NOTE;
    const info = this.root.querySelector('#paid-info') as HTMLElement;
    const thead = this.root.querySelector('#thead-paid') as HTMLElement;
    const tbody = this.root.querySelector('#tbody-paid') as HTMLElement;
    thead.innerHTML = '';
    tbody.innerHTML = '';
    const [headers, rows] = clubData.paid_rows_table(this.paidRows, marks);
    tabBtn.textContent = rows.length ? `Paying outside Thrive (${rows.length})` : 'Paying outside Thrive';
    const stale = this.result ? clubData.unmatched_paid_marks(marks, this.paidRows) : 0;
    info.textContent = stale ? `${stale} mark(s) are for players not in these files any more; you can clear them.`
      : !this.result && marks.length ? `${marks.length} player(s) marked. Click Reconcile to see them.` : '';
    const trHead = document.createElement('tr');
    for (const h of [...headers, '']) {
      const th = document.createElement('th');
      th.textContent = h;
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    rows.forEach((vals) => {
      const row = this.paidRows.find((r) => rc._name_dob(r, rc.todayLocalDate())[0] === vals[0] &&
        rc.formatDate(rc._name_dob(r, rc.todayLocalDate())[1]) === vals[1]);
      const tr = document.createElement('tr');
      for (const v of vals) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      const td = document.createElement('td');
      if (row) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Clear mark';
        btn.addEventListener('click', () => {
          this.clubData.paid_outside = clubData.unmark_paid(this.clubData.paid_outside || [], row);
          this.saveClubDataAndRecompute(`${vals[0]} is checked against Thrive again.`);
        });
        td.appendChild(btn);
      }
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  }

  private renderLeftTab(): void {
    this.renderPaidTab();
    const tabBtn = this.root.querySelector('#tab-btn-left') as HTMLElement;
    (this.root.querySelector('#left-note') as HTMLElement).textContent = clubData.LEFT_NOTE;
    const info = this.root.querySelector('#left-info') as HTMLElement;
    const thead = this.root.querySelector('#thead-left') as HTMLElement;
    const tbody = this.root.querySelector('#tbody-left') as HTMLElement;
    thead.innerHTML = '';
    tbody.innerHTML = '';
    const [headers, rows] = clubData.left_rows_table(this.leftRows, this.clubData.left_players);
    tabBtn.textContent = rows.length ? `Left the club (${rows.length})` : 'Left the club';
    const parts: string[] = [];
    const stillFa = this.leftRows.filter((r) => r.fa).length;
    if (stillFa) parts.push(`${stillFa} still in the FA report: release them in the Whole Game System.`);
    const stale = this.result ? clubData.unmatched_marks(this.clubData.left_players, this.leftRows) : 0;
    if (stale) parts.push(`${stale} mark(s) are for players not in these files any more; you can clear them.`);
    if (!this.result) parts.push(`${this.clubData.left_players.length} player(s) marked. Click Reconcile to see them.`);
    info.textContent = parts.join('  ');
    const trHead = document.createElement('tr');
    for (const h of [...headers, '']) {
      const th = document.createElement('th');
      th.textContent = h;
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    rows.forEach((vals) => {
      const row = this.leftRows.find((r) => rc._name_dob(r, rc.todayLocalDate())[0] === vals[0] &&
        rc.formatDate(rc._name_dob(r, rc.todayLocalDate())[1]) === vals[1]);
      const tr = document.createElement('tr');
      for (const v of vals) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      const td = document.createElement('td');
      if (row) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Back in the club';
        btn.addEventListener('click', () => {
          this.clubData.left_players = clubData.unmark(this.clubData.left_players, row);
          this.saveClubDataAndRecompute(`${vals[0]} is back in the club.`);
        });
        td.appendChild(btn);
      }
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  }

  /** Ask for a passphrase in a modal (twice when saving). Resolves null when cancelled. */
  private askPassphrase(title: string, confirm: boolean): Promise<string | null> {
    return new Promise((resolve) => {
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.className = 'view-desc';
      p.textContent = 'Passphrase (at least 8 characters). You need it to open the file on the other computer, so keep it safe: it cannot be recovered.';
      const first = document.createElement('input');
      first.type = 'password';
      first.setAttribute('aria-label', 'Passphrase');
      first.autocomplete = 'new-password';
      body.append(p, first);
      const second = document.createElement('input');
      if (confirm) {
        second.type = 'password';
        second.setAttribute('aria-label', 'Type the passphrase again');
        second.placeholder = 'Type it again';
        second.autocomplete = 'new-password';
        body.appendChild(second);
      }
      const err = document.createElement('p');
      err.className = 'toolbar-warn';
      body.appendChild(err);
      const footer = document.createElement('div');
      footer.className = 'modal-footer-right';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => {
        this.closeModal();
        resolve(null);
      });
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn-primary';
      ok.textContent = 'OK';
      ok.addEventListener('click', () => {
        if (first.value.length < 8) {
          err.textContent = 'Use at least 8 characters.';
          return;
        }
        if (confirm && second.value !== first.value) {
          err.textContent = 'The two passphrases do not match.';
          return;
        }
        this.closeModal();
        resolve(first.value);
      });
      footer.append(cancel, ok);
      this.openCustomModal(title, body, footer);
      first.focus();
    });
  }

  private async exportClubData(): Promise<void> {
    if (!this.clubData.left_players.length && !Object.keys(this.clubData.coach_notes).length &&
      !(this.clubData.paid_outside || []).length) {
      this.showMessageModal('Nothing to export', 'There are no player marks or coach notes yet.');
      return;
    }
    const passphrase = await this.askPassphrase('Export club data', true);
    if (!passphrase) return;
    const text = await clubData.exportEncrypted(this.clubData, passphrase);
    const fileName = `Club_data_${todayIsoDate()}.prdata`;
    downloadBlob(text, fileName, 'application/json');
    this.setStatus(`Downloaded ${fileName}. Open it on the other computer with Import club data and the passphrase.`);
  }

  private async importClubData(text: string): Promise<void> {
    const passphrase = await this.askPassphrase('Import club data', false);
    if (!passphrase) return;
    try {
      const incoming = await clubData.importEncrypted(text, passphrase);
      this.clubData = clubData.merge(this.clubData, incoming);
      clubData.saveClubData(this.storage, this.clubData);
      this.recompute();
      this.renderLeftTab();
      await this.renderCoachesTab();
      this.showMessageModal('Imported', `Imported ${incoming.left_players.length} left the club mark(s), ${(incoming.paid_outside || []).length} paying outside Thrive mark(s) and ${Object.keys(incoming.coach_notes).length} coach note(s), merged with this browser's.`);
    } catch (exc) {
      this.showMessageModal('Import club data', exc instanceof Error ? exc.message : String(exc));
    }
  }

  /** Add or change the note for a coach (kept in this browser against a one-way code of their FAN ID). */
  private openCoachNote(coach: CoachesModule.Coach): void {
    const body = document.createElement('div');
    const desc = document.createElement('p');
    desc.className = 'view-desc';
    desc.textContent = 'A note about this coach, for example a course booked or a DBS in progress. It is kept in this browser and can be moved to another computer with Export club data (encrypted) on the Left the club tab.';
    const textarea = document.createElement('textarea');
    textarea.className = 'whatsapp-textarea';
    textarea.setAttribute('aria-label', `Note for ${coach.name}`);
    textarea.maxLength = clubData.MAX_NOTE;
    textarea.value = clubData.note_for(this.clubData.coach_notes, coach);
    body.append(desc, textarea);
    const footer = document.createElement('div');
    footer.className = 'modal-footer-right';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.closeModal());
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn-primary';
    save.textContent = 'Save note';
    save.addEventListener('click', () => {
      this.clubData.coach_notes = clubData.set_note(this.clubData.coach_notes, coach, textarea.value);
      clubData.saveClubData(this.storage, this.clubData);
      this.closeModal();
      void this.renderCoachesTab();
      this.setStatus(`Note saved for ${coach.name}.`);
    });
    footer.append(cancel, save);
    this.openCustomModal(`Note: ${coach.name}`, body, footer);
  }

  /** A copy of the managers / club officials file with the FA Team Qualifications Report merged in. */
  private async exportUpdatedOfficials(): Promise<void> {
    if (!this.coaches) {
      this.showMessageModal('No FA qualifications report', 'Choose the FA qualifications report in Step 1 and click Reconcile first.');
      return;
    }
    const { bytes, changed } = await (await loadExcelIo()).buildUpdatedOfficialsBuffer(this.coaches, this.staffFile,
      (c) => clubData.note_for(this.clubData.coach_notes, c));
    const base = this.staffFile ? this.staffFile.name.replace(/\.[^.]+$/, '') : 'Club_officials';
    const fileName = `${base}_updated_${todayIsoDate()}.xlsx`;
    downloadBlob(bytes, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    this.setStatus(
      `Downloaded ${fileName}: ${changed} people added or updated (coloured rows; see the Changes column). Check it, then use it as your managers file.`
    );
  }

  /** WhatsApp reminder for one coach: editable text, then open WhatsApp at their chat (or copy the text). */
  private openCoachReminder(coach: CoachesModule.Coach, message: string): void {
    const body = document.createElement('div');
    const desc = document.createElement('p');
    desc.className = 'view-desc wa-desc';
    desc.textContent =
      'Replace the [What to do: ...] text with what this coach needs to do, then send. The message goes to WhatsApp in the link, so send it only to this coach.';
    const textarea = document.createElement('textarea');
    textarea.className = 'whatsapp-textarea';
    textarea.setAttribute('aria-label', `WhatsApp reminder for ${coach.name}`);
    textarea.value = message;
    body.append(desc, textarea);
    const footer = document.createElement('div');
    footer.className = 'wa-send-row';
    const phone = coach.phone || '';
    if (contact.whatsappLink(phone, '')) {
      const a = document.createElement('a');
      a.className = 'btn-whatsapp-send';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `Send to ${coach.name.split(/\s+/)[0]} on WhatsApp...`;
      a.href = contact.whatsappLink(phone, textarea.value) || '#';
      a.addEventListener('click', () => {
        a.href = contact.whatsappLink(phone, textarea.value) || '#';
        this.setStatus(`Opening WhatsApp at ${coach.name}'s chat. Check the message, then press send.`);
      });
      footer.appendChild(a);
    } else {
      const note = document.createElement('p');
      note.className = 'wa-send-note';
      note.textContent = 'No phone number for this coach in the officials file: copy the text instead.';
      footer.appendChild(note);
    }
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => void this.copyText(textarea.value, 'Copied. Paste it into WhatsApp.'));
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.closeModal());
    footer.append(copyBtn, closeBtn);
    this.openCustomModal(`WhatsApp reminder: ${coach.name}`, body, footer);
  }

  private async executeFileLoading(input: ReconcileInput): Promise<LoadedFilesPayload> {
    // Use Web Worker in browser when available; fall back to direct execution in jsdom/tests
    if (typeof Worker !== 'undefined' && !navigator.userAgent.includes('jsdom')) {
      try {
        return await new Promise<LoadedFilesPayload>((resolve, reject) => {
          const worker = new Worker(new URL('./worker.ts', import.meta.url), {
            type: 'module',
          });
          worker.onmessage = (ev: MessageEvent) => {
            const data = ev.data;
            if (data.type === 'step') {
              this.updateProgressStep(data.stepIndex);
            } else if (data.type === 'loaded') {
              worker.terminate();
              const raw = data.payload as LoadedFilesPayload;
              // Rehydrate prototype methods after structured clone
              raw.faPlayers = raw.faPlayers.map(
                (p) =>
                  new rc.FAPlayer(
                    p.fan_id,
                    p.first,
                    p.last,
                    p.dob,
                    p.suspended,
                    p.teams,
                    p.parents,
                    p.fields
                  )
              );
              raw.thrivePlayers = raw.thrivePlayers.map(
                (t) =>
                  new rc.ThrivePlayer(t.first, t.last, t.dob, t.mandate, t.teams, t.fields)
              );
              raw.staff = raw.staff.map(
                (s) => new rc.Staff(s.name, s.role, s.teams, s.phone, s.email)
              );
              resolve(raw);
            } else if (data.type === 'error') {
              worker.terminate();
              reject(new WorkerReportedError(data.message));
            }
          };
          worker.onerror = (err) => {
            worker.terminate();
            reject(err);
          };
          worker.postMessage(input);
        });
      } catch (exc) {
        // The worker read the files and found a problem: report it, do not read them all again
        if (exc instanceof WorkerReportedError) throw exc;
        // Otherwise the worker could not start (old browser, blocked): read on the main thread instead
      }
    }
    const { loadFilesWithSteps } = await import('./reconcile_runner');
    return loadFilesWithSteps(input, (step) => this.updateProgressStep(step));
  }

  private computeResult(): rc.Result {
    const res = rc.reconcile(
      this.faPlayers || [],
      this.thrivePlayers || [],
      this.settings.team_map,
      this.settings.fuzzy
    );
    // players marked as left the club come out of everything, before the managers are attached
    this.leftRows = clubData.apply_left(res, this.clubData.left_players);
    this.paidRows = clubData.apply_paid(res, this.clubData.paid_outside || []);
    rc.attach_staff(res, this.staff, this.settings.team_map);
    return res;
  }

  private recompute(): void {
    if (!this.faPlayers || !this.thrivePlayers || this.busy) return;
    this.applyResult(this.computeResult());
  }

  public setStepsCollapsed(collapsed: boolean): void {
    const stepsGrid = this.root.querySelector('#steps-grid') as HTMLElement | null;
    const collapsedBar = this.root.querySelector('#steps-collapsed-bar') as HTMLElement | null;
    if (stepsGrid && collapsedBar) {
      stepsGrid.hidden = collapsed;
      collapsedBar.hidden = !collapsed;
    }
  }

  private applyResult(res: rc.Result): void {
    this.result = res;

    // Hide all "Not reconciled yet" overlays
    this.root.querySelectorAll('.placeholder-overlay').forEach((el) => {
      (el as HTMLElement).hidden = el.id === 'placeholder-coaches' ? this.coaches !== null : true;
    });

    // Enable export and sharing buttons
    this.root.querySelectorAll('.export-action-btn').forEach((btn) => {
      (btn as HTMLButtonElement).disabled = false;
    });

    // Update collapsible steps summary bar & enable collapse toggle
    const summaryEl = this.root.querySelector('#steps-collapsed-summary') as HTMLElement | null;
    if (summaryEl) {
      summaryEl.textContent = `✔ Reconciled (${this.faPlayers?.length || 0} FA, ${this.thrivePlayers?.length || 0} Thrive)`;
    }
    const collapseBtn = this.root.querySelector('#btn-collapse-steps') as HTMLElement | null;
    if (collapseBtn) {
      collapseBtn.hidden = false;
    }

    // Populate team selector
    const labels = rc.team_labels(res);
    const selectTeam = this.root.querySelector('#select-team') as HTMLSelectElement;
    selectTeam.innerHTML = '';
    for (const label of labels) {
      const opt = document.createElement('option');
      opt.value = label;
      opt.textContent = contact.teamChoiceLabelWithUnpaid(res, label);
      selectTeam.appendChild(opt);
    }
    if (labels.length > 0) {
      if (!labels.includes(this.settings.team)) {
        this.settings.team = labels[0];
        this.persistSettings();
      }
      selectTeam.value = this.settings.team;
    }

    this.refreshAll();
    this.renderLeftTab();
  }

  private afterRunMessages(loaded: LoadedFilesPayload, addedCount: number): void {
    this.runFilesKey = this.currentFilesSignature();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const stateLbl = this.root.querySelector('#run-state-label') as HTMLElement;
    stateLbl.textContent = `Last run ${hh}:${mm}`;
    stateLbl.className = 'run-state-text ok';

    // On mobile / narrow viewports (e.g. Pixel 10 Pro), automatically collapse the Step 1-3 cards
    // into the compact summary bar so the reconciled results are immediately visible at the top.
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth <= 860) {
      this.setStepsCollapsed(true);
    }

    const unmapped = this.unmappedTeams();
    const thriveOnly = !this.faPlayers || this.faPlayers.length === 0;
    let msg =
      (thriveOnly
        ? `Thrive only: read ${this.thrivePlayers?.length || 0} Thrive players. FA registration was not checked (no FA report chosen). `
        : `Compared ${this.faPlayers?.length || 0} FA players with ${this.thrivePlayers?.length || 0} Thrive players. `) +
      'Pick a view on the left of the Results tab. Click any row for the full details.';
    if (addedCount > 0 && !thriveOnly) {
      msg += ` ${addedCount} new Thrive team(s) were matched automatically.`;
    }
    if (this.coaches) {
      msg += ` Coaches tab: ${this.coaches.coaches.length} team officials from the FA qualifications report.`;
    }
    if (unmapped.length > 0 && !thriveOnly) {
      // a Thrive-only run uses Thrive's own team names, so no mapping is needed
      msg += ` ${unmapped.length} Thrive team(s) need a decision on the Team mappings tab.`;
      this.switchTab('mappings');
    }
    if (this.missingItems.length > 0) {
      msg +=
        ' The Thrive export is missing: ' +
        this.missingItems.map(([i]) => i).join(', ') +
        '. See Help > Getting the exports.';
    }
    this.setHint(msg);

    const todayStr = rc.formatDate(rc.todayLocalDate());
    this.setStatus(
      `Reconciled at ${todayStr}   |   ${this.faFile?.name || 'Thrive only (no FA report)'}   |   ${this.thriveFile?.name || ''}`
    );

    const notices: string[] = [];
    if (loaded.swapped && thriveOnly) {
      notices.push('The Thrive export was in the FA box, so it was moved to the Thrive box.');
    } else if (loaded.swapped) {
      notices.push('The two files were in the wrong boxes, so they were swapped automatically.');
    }
    if (loaded.staffError) {
      notices.push(`Managers file not used: ${loaded.staffError}\nThe comparison carried on without it.`);
    }
    if (this.missingItems.length > 0) {
      const lines = this.missingItems.map(([item, use]) => `  • ${item}: ${use}`).join('\n');
      notices.push(
        `The comparison has run, but the Thrive export does not include these items, so the tool cannot show:\n\n${lines}\n\nTo add them: in Thrive go to Contacts, open Manage table columns, add the items above, then Export again and click Reconcile.`
      );
    }
    if (notices.length > 0) {
      this.showMessageModal('Reconciliation notes', notices.join('\n\n---\n\n'));
    }
  }

  private refreshAll(): void {
    this.renderResultsSidebar();
    this.renderResultsTable();
    this.renderTeamTab();
    this.renderNotPayingTab();
    this.renderConsentsTab();
    this.renderMappingsTab();
  }

  // ------------------------------------------------------------------ Results Tab (#19)

  private renderResultsSidebar(): void {
    const container = this.root.querySelector('#view-list-container') as HTMLElement;
    const selectMobileView = this.root.querySelector('#select-mobile-view') as HTMLSelectElement;
    container.innerHTML = '';
    selectMobileView.innerHTML = '';

    const tabCounts = new Map<string, number>();
    if (this.result) {
      for (const [title, pred] of rc.RESULT_TABS) {
        tabCounts.set(title, this.result.rows.filter(pred).length);
      }
      const counts = this.result.counts();
      const attention = Object.entries(counts)
        .filter(([k]) => rc.LEVELS[k] === 'bad' || rc.LEVELS[k] === 'warn')
        .reduce((acc, [, n]) => acc + n, 0);
      const statsEl = this.root.querySelector('#results-summary-stats') as HTMLElement;
      statsEl.textContent = this.result.fa_checked
        ? `${counts['Matched'] || 0} fully matched   |   ${attention} need attention`
        : `${this.result.rows.length} Thrive players (FA not checked)   |   ${attention} need attention`;
    } else {
      (this.root.querySelector('#results-summary-stats') as HTMLElement).textContent = '';
    }

    for (const [group, views] of VIEW_GROUPS) {
      const grpHeading = document.createElement('div');
      grpHeading.className = 'view-group-title';
      grpHeading.textContent = group;
      container.appendChild(grpHeading);

      const optGroup = document.createElement('optgroup');
      optGroup.label = group;

      for (const [title, desc] of views) {
        const count = tabCounts.get(title) ?? 0;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'view-item-btn';
        btn.setAttribute('aria-current', String(title === this.currentView));

        const labelSpan = document.createElement('span');
        const shownTitle = rc.view_title(title, this.result);
        labelSpan.textContent = shownTitle;
        btn.appendChild(labelSpan);

        if (this.result) {
          const pill = document.createElement('span');
          pill.className = 'view-count-pill';
          pill.textContent = String(count);
          btn.appendChild(pill);
        }

        btn.addEventListener('click', () => {
          this.currentView = title;
          this.renderResultsSidebar();
          this.renderResultsTable();
        });
        container.appendChild(btn);

        const opt = document.createElement('option');
        opt.value = title;
        opt.textContent = this.result ? `${shownTitle} (${count})` : shownTitle;
        optGroup.appendChild(opt);

        if (title === this.currentView) {
          (this.root.querySelector('#results-view-title') as HTMLElement).textContent = shownTitle;
          (this.root.querySelector('#results-view-desc') as HTMLElement).textContent = desc;
        }
      }
      selectMobileView.appendChild(optGroup);
    }
    selectMobileView.value = this.currentView;
  }

  private renderResultsTable(): void {
    const thead = this.root.querySelector('#thead-results') as HTMLElement;
    const tbody = this.root.querySelector('#tbody-results') as HTMLElement;
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const trHead = document.createElement('tr');
    for (const [idx, [title, attr]] of rc.COLUMNS.entries()) {
      const th = document.createElement('th');
      const arrow =
        this.resultsSort.col === attr ? (this.resultsSort.desc ? ' ▼' : ' ▲') : '';
      th.textContent = title + arrow;
      makeSortableHeader(th, this.resultsSort.col === attr, this.resultsSort.desc, () => {
        if (this.resultsSort.col === attr) {
          this.resultsSort.desc = !this.resultsSort.desc;
        } else {
          this.resultsSort = { col: attr, desc: false };
        }
        this.renderResultsTable();
        this.focusSortedHeader('#thead-results', idx);
      });
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);

    if (!this.result) return;

    const predMap = new Map(rc.RESULT_TABS);
    const pred = predMap.get(this.currentView) || (() => true);
    let rows = this.result.rows.filter(pred);
    const totalInView = rows.length;

    const term = this.resultsSearch.trim().toLowerCase();
    if (term) {
      rows = rows.filter((r) =>
        rc.COLUMNS.map(([, a]) => rc.cellDateOrStr(r[a]))
          .join(' ')
          .toLowerCase()
          .includes(term)
      );
    }

    if (this.resultsSort.col) {
      const col = this.resultsSort.col;
      const dir = this.resultsSort.desc ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const va = rc.cellDateOrStr(a[col]).toLowerCase();
        const vb = rc.cellDateOrStr(b[col]).toLowerCase();
        return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
      });
    }

    const filterCountEl = this.root.querySelector('#results-filter-count') as HTMLElement;
    filterCountEl.textContent = term ? `Showing ${rows.length} of ${totalInView}` : '';

    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = `level-${row.level}`;
      tr.tabIndex = 0;

      const values: string[] = [];
      rc.COLUMNS.forEach(([, attr], idx) => {
        const td = document.createElement('td');
        const text = rc.cellDateOrStr(row[attr]);
        values.push(text);
        // Colour + icon badge on Result column so status is never conveyed by colour alone (#24)
        td.textContent = idx === 0 ? levelBadge(row.level) + text : text;
        tr.appendChild(td);
      });

      const openDetail = () => {
        this.openRowDetailModal(
          rc.COLUMNS.map(([t]) => t),
          values
        );
      };
      tr.addEventListener('click', openDetail);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail();
        }
      });
      tbody.appendChild(tr);
    }
  }

  // ------------------------------------------------------------------ Team Sheets Tab (#20)

  private stepTeam(delta: number): void {
    if (!this.result) return;
    const labels = rc.team_labels(this.result);
    if (labels.length === 0) return;
    const curIdx = labels.indexOf(this.settings.team);
    const nextIdx =
      curIdx >= 0
        ? (curIdx + delta + labels.length) % labels.length
        : 0;
    this.settings.team = labels[nextIdx];
    this.persistSettings();
    (this.root.querySelector('#select-team') as HTMLSelectElement).value = this.settings.team;
    this.renderTeamTab();
  }

  private renderTeamTab(): void {
    const thead = this.root.querySelector('#thead-teams') as HTMLElement;
    const tbody = this.root.querySelector('#tbody-teams') as HTMLElement;
    const posLabel = this.root.querySelector('#team-pos-label') as HTMLElement;
    const unpaidBanner = this.root.querySelector('#team-unpaid-banner') as HTMLElement;
    const summaryText = this.root.querySelector('#team-summary-text') as HTMLElement;

    const medical = this.settings.medical;
    const viewHeaders = rc.team_view_headers(medical);

    thead.innerHTML = '';
    tbody.innerHTML = '';
    const trHead = document.createElement('tr');
    viewHeaders.forEach((title, idx) => {
      const th = document.createElement('th');
      const arrow =
        this.teamSort.col === idx ? (this.teamSort.desc ? ' ▼' : ' ▲') : '';
      th.textContent = title + arrow;
      makeSortableHeader(th, this.teamSort.col === idx, this.teamSort.desc, () => {
        if (this.teamSort.col === idx) {
          this.teamSort.desc = !this.teamSort.desc;
        } else {
          this.teamSort = { col: idx, desc: false };
        }
        this.renderTeamTab();
        this.focusSortedHeader('#thead-teams', idx);
      });
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    if (!this.result) {
      posLabel.textContent = '';
      unpaidBanner.textContent = '';
      summaryText.textContent = '';
      return;
    }

    const labels = rc.team_labels(this.result);
    const label = this.settings.team;
    if (!labels.includes(label)) {
      posLabel.textContent = '';
      unpaidBanner.textContent = '';
      summaryText.textContent = '';
      return;
    }

    posLabel.textContent = `${labels.indexOf(label) + 1} of ${labels.length}`;
    const [fullHeaders, rawRows] = rc.team_report(this.result, label, medical);
    const payingIdx = fullHeaders.indexOf('Paying through Thrive');
    const inIdx = viewHeaders.indexOf('In');

    interface TeamItem {
      shown: string[];
      unpaid: boolean;
      medicalAlert: boolean;
      source: string;
      fullHeaders: string[];
      fullValues: unknown[];
      searchBlob: string;
    }

    const items: TeamItem[] = [];
    let unpaidCount = 0;
    const sourceCounts: Record<string, number> = {
      Both: 0,
      'FA only': 0,
      'Thrive only': 0,
      [rc.NO_FA]: 0,
    };

    for (const [values, source] of rawRows) {
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      const overview = rc.team_overview(fullHeaders, values, medical).map((v) =>
        rc.cellDateOrStr(v)
      );
      const unpaid = rc.is_unpaid(String(values[payingIdx] ?? ''));
      if (unpaid) unpaidCount += 1;
      const medicalAlert = medical && overview.includes('⚠ Yes');
      items.push({
        shown: overview,
        unpaid,
        medicalAlert,
        source,
        fullHeaders,
        fullValues: values,
        searchBlob:
          overview.join(' ').toLowerCase() +
          ' ' +
          values.map((v) => rc.cellDateOrStr(v)).join(' ').toLowerCase(),
      });
    }

    if (unpaidCount > 0) {
      unpaidBanner.textContent = `✖ ${unpaidCount} not paying through Thrive`;
      unpaidBanner.className = 'unpaid-banner-count unpaid';
    } else {
      unpaidBanner.textContent = '✔ Everyone is paying through Thrive';
      unpaidBanner.className = 'unpaid-banner-count all-paid';
    }

    const staffStr = rc.staff_lines(this.result, label).join('   |   ');
    summaryText.textContent =
      (this.result.fa_checked
        ? `${rawRows.length} players: ${sourceCounts['Both']} in both, ${sourceCounts['FA only']} FA only, ${sourceCounts['Thrive only']} Thrive only` +
          (sourceCounts[rc.NO_FA] ? `, ${sourceCounts[rc.NO_FA]} no FA needed` : '')
        : `${rawRows.length} players in Thrive (FA not checked)`) +
      (staffStr ? `   |   ${staffStr}` : '');

    let filtered = items;
    const term = this.teamSearch.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((it) => it.searchBlob.includes(term));
    }
    if (this.teamOnlyUnpaid) {
      filtered = filtered.filter((it) => it.unpaid);
    }
    if (this.teamSort.col !== null) {
      const col = this.teamSort.col;
      const dir = this.teamSort.desc ? -1 : 1;
      filtered = [...filtered].sort(
        (a, b) => compareSortKeys(sortKey(a.shown[col]), sortKey(b.shown[col])) * dir
      );
    }

    const countEl = this.root.querySelector('#team-filter-count') as HTMLElement;
    countEl.textContent =
      term || this.teamOnlyUnpaid ? `Showing ${filtered.length} of ${items.length}` : '';

    for (const item of filtered) {
      const tr = document.createElement('tr');
      const classes: string[] = [];
      if (item.unpaid) {
        classes.push('row-unpaid');
      } else if (item.source === 'Both') {
        classes.push('source-both');
      } else if (item.source === 'FA only') {
        classes.push('source-fa');
      } else if (item.source === 'Thrive only' || item.source === rc.FA_NOT_CHECKED) {
        classes.push('source-thrive');
      } else {
        classes.push('source-nofa');
      }
      if (item.medicalAlert) {
        classes.push('row-medical');
      }
      tr.className = classes.join(' ');
      tr.tabIndex = 0;

      item.shown.forEach((val, idx) => {
        const td = document.createElement('td');
        td.textContent = idx === inIdx ? sourceBadge(val) : val;
        tr.appendChild(td);
      });

      const openPlayerDetail = () => {
        this.openTeamPlayerDetailModal(item.fullHeaders, item.fullValues);
      };
      tr.addEventListener('click', openPlayerDetail);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPlayerDetail();
        }
      });
      tbody.appendChild(tr);
    }
  }

  // ------------------------------------------------------------------ Not Paying Tab (#21)

  private renderNotPayingTab(): void {
    const tabBtn = this.root.querySelector('#tab-btn-not-paying') as HTMLElement;
    const warnEl = this.root.querySelector('#np-mandate-warning') as HTMLElement;
    const thead = this.root.querySelector('#thead-np') as HTMLElement;
    const tbody = this.root.querySelector('#tbody-np') as HTMLElement;
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (!this.result) {
      tabBtn.textContent = 'Not paying';
      warnEl.textContent = '';
      return;
    }

    const noMandates = this.missingItems.some(([i]) => i === 'Active pre-authorisation');
    warnEl.textContent = noMandates
      ? 'Mandates could not be checked: the Thrive export has no Active pre-authorisation column, so this list only shows players not found in Thrive. Add Active pre-authorisation in Thrive (Contacts > Manage table columns), export again and reconcile.'
      : '';

    const [headers, rawRows] = rc.not_paying_report(this.result);
    tabBtn.textContent = `Not paying (${rawRows.length})`;

    this.renderSortableReportTable(
      thead,
      tbody,
      this.root.querySelector('#np-filter-count') as HTMLElement,
      headers,
      rawRows,
      this.npSearch,
      this.npSort,
      (nextSort) => {
        this.npSort = nextSort;
        this.renderNotPayingTab();
      },
      true
    );
  }

  // ------------------------------------------------------------------ Missing Consents Tab

  private renderConsentsTab(): void {
    const tabBtn = this.root.querySelector('#tab-btn-consents') as HTMLElement;
    const warnEl = this.root.querySelector('#cons-unchecked-warning') as HTMLElement;
    const thead = this.root.querySelector('#thead-cons') as HTMLElement;
    const tbody = this.root.querySelector('#tbody-cons') as HTMLElement;
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (!this.result) {
      tabBtn.textContent = 'Missing consents';
      warnEl.textContent = '';
      return;
    }

    const [headers, rawRows, checked] = rc.consents_report(this.result);
    tabBtn.textContent = `Missing consents (${rawRows.length})`;

    const unchecked = rc.CONSENT_ITEMS.map(([, n]) => n).filter((n) => !checked.includes(n));
    warnEl.textContent =
      unchecked.length > 0
        ? `Not checked, because the Thrive export has no answers for: ${unchecked.join(', ')}. Add them in Thrive (Contacts > Manage table columns) and export again.`
        : '';

    this.renderSortableReportTable(
      thead,
      tbody,
      this.root.querySelector('#cons-filter-count') as HTMLElement,
      headers,
      rawRows,
      this.consSearch,
      this.consSort,
      (nextSort) => {
        this.consSort = nextSort;
        this.renderConsentsTab();
      },
      false
    );
  }

  private renderSortableReportTable(
    thead: HTMLElement,
    tbody: HTMLElement,
    countEl: HTMLElement,
    headers: string[],
    rawRows: Array<[unknown[], string]>,
    searchTerm: string,
    sortState: { col: number | null; desc: boolean },
    onSortChange: (next: { col: number | null; desc: boolean }) => void,
    hideEmpty: boolean
  ): void {
    const strRows: Array<[string[], string]> = rawRows.map(([vals, src]) => [
      vals.map((v) => rc.cellDateOrStr(v)),
      src,
    ]);

    const visibleColIndices = headers
      .map((_, i) => i)
      .filter(
        (i) =>
          !hideEmpty ||
          strRows.length === 0 ||
          i === 0 ||
          strRows.some(([r]) => Boolean(r[i].trim()))
      );
    const hiddenNames = headers.filter((_, i) => !visibleColIndices.includes(i));

    const trHead = document.createElement('tr');
    for (const [pos, colIdx] of visibleColIndices.entries()) {
      const th = document.createElement('th');
      const arrow =
        sortState.col === colIdx ? (sortState.desc ? ' ▼' : ' ▲') : '';
      th.textContent = headers[colIdx] + arrow;
      makeSortableHeader(th, sortState.col === colIdx, sortState.desc, () => {
        if (sortState.col === colIdx) {
          onSortChange({ col: colIdx, desc: !sortState.desc });
        } else {
          onSortChange({ col: colIdx, desc: false });
        }
        const theadId = thead.id ? `#${thead.id}` : '';
        if (theadId) this.focusSortedHeader(theadId, pos);
      });
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);

    let filtered = strRows;
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter(([vals]) => vals.join(' ').toLowerCase().includes(term));
    }
    if (sortState.col !== null) {
      const col = sortState.col;
      const dir = sortState.desc ? -1 : 1;
      filtered = [...filtered].sort(
        (a, b) => compareSortKeys(sortKey(a[0][col]), sortKey(b[0][col])) * dir
      );
    }

    const parts: string[] = [];
    if (term) parts.push(`Showing ${filtered.length} of ${strRows.length}`);
    if (hideEmpty && hiddenNames.length > 0 && strRows.length > 0) {
      parts.push(`${hiddenNames.length} empty column(s) hidden: ${hiddenNames.join(', ')}`);
    }
    countEl.textContent = parts.join('   ');

    for (const [vals, src] of filtered) {
      const tr = document.createElement('tr');
      tr.className =
        src === 'Both'
          ? 'source-both'
          : src === 'FA only'
            ? 'source-fa'
            : src === 'Thrive only'
              ? 'source-thrive'
              : 'source-nofa';
      tr.tabIndex = 0;

      for (const colIdx of visibleColIndices) {
        const td = document.createElement('td');
        td.textContent =
          headers[colIdx] === 'In' ? sourceBadge(vals[colIdx]) : vals[colIdx];
        tr.appendChild(td);
      }

      const openDetail = () => {
        this.openRowDetailModal(headers, vals);
      };
      tr.addEventListener('click', openDetail);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail();
        }
      });
      tbody.appendChild(tr);
    }
  }

  // ------------------------------------------------------------------ Team Mappings Tab (#22)

  private thriveTeamCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of this.thrivePlayers || []) {
      for (const t of p.teams) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return counts;
  }

  private allKnownFaTeams(): string[] {
    const teams = new Set<string>();
    for (const p of this.faPlayers || []) {
      for (const t of Object.keys(p.teams)) {
        teams.add(t);
      }
    }
    for (const v of Object.values(this.settings.team_map)) {
      if (v) teams.add(v);
    }
    return Array.from(teams).sort();
  }

  private unmappedTeams(): string[] {
    const known = new Set(Object.keys(this.settings.team_map).map((k) => rc._tkey(k)));
    return Object.keys(this.thriveTeamCounts())
      .filter((t) => !known.has(rc._tkey(t)) && !rc.no_fa_age_group(t))
      .sort();
  }

  private renderMappingsTab(): void {
    const tbody = this.root.querySelector('#tbody-mappings') as HTMLElement;
    const warnEl = this.root.querySelector('#map-unmapped-warning') as HTMLElement;
    const targetSelect = this.root.querySelector('#select-map-target') as HTMLSelectElement;
    tbody.innerHTML = '';

    const counts = this.thriveTeamCounts();
    const known = new Map<string, string>();
    for (const k of Object.keys(this.settings.team_map)) {
      known.set(rc._tkey(k), k);
    }

    const allNames = Array.from(
      new Set([...Object.keys(this.settings.team_map), ...Object.keys(counts)])
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    for (const name of allNames) {
      const key = known.get(rc._tkey(name));
      let faLabel: string;
      let rowClass = '';
      if (rc.no_fa_age_group(name)) {
        faLabel = IGNORE_LABEL; // U4-U6 never have an FA team, whatever the mapping says
        rowClass = 'level-info';
      } else if (key === undefined) {
        faLabel = UNMAPPED_LABEL;
        rowClass = 'level-bad';
      } else if (this.settings.team_map[key] === rc.IGNORE) {
        faLabel = IGNORE_LABEL;
        rowClass = 'level-info';
      } else {
        faLabel = this.settings.team_map[key]!;
      }

      const tr = document.createElement('tr');
      tr.className = rowClass;
      tr.tabIndex = 0;
      if (name === this.selectedMappingTeam) {
        tr.classList.add('selected-mapping-row');
      }

      const tdThrive = document.createElement('td');
      tdThrive.textContent = name;
      const tdFa = document.createElement('td');
      tdFa.textContent =
        faLabel === UNMAPPED_LABEL
          ? `✖ ${UNMAPPED_LABEL}`
          : faLabel === IGNORE_LABEL
            ? `ℹ ${IGNORE_LABEL}`
            : faLabel;
      const tdCount = document.createElement('td');
      tdCount.textContent = counts[name] !== undefined ? String(counts[name]) : '';

      tr.append(tdThrive, tdFa, tdCount);

      const selectRow = () => {
        this.selectedMappingTeam = name;
        (this.root.querySelector('#map-selected-label') as HTMLElement).textContent = name;
        targetSelect.value = faLabel !== UNMAPPED_LABEL ? faLabel : '';
        this.renderMappingsTab();
      };
      tr.addEventListener('click', selectRow);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectRow();
        }
      });
      tbody.appendChild(tr);
    }

    const currentTarget = targetSelect.value;
    targetSelect.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- Choose FA team --';
    targetSelect.appendChild(emptyOpt);

    for (const optVal of [IGNORE_LABEL, ...this.allKnownFaTeams()]) {
      const opt = document.createElement('option');
      opt.value = optVal;
      opt.textContent = optVal;
      targetSelect.appendChild(opt);
    }
    targetSelect.value = currentTarget;

    const missing = this.unmappedTeams();
    warnEl.textContent =
      missing.length > 0
        ? `${missing.length} Thrive team(s) need a decision (red rows): ${missing.join(', ')}`
        : '';
  }

  private onMappingChanged(): void {
    this.persistSettings();
    this.recompute();
    this.renderMappingsTab();
  }

  private applySelectedMapping(): void {
    const name = this.selectedMappingTeam;
    const target = (this.root.querySelector('#select-map-target') as HTMLSelectElement).value;
    if (!name || !target) {
      this.showMessageModal(
        'Team mappings',
        'Click a row in the list, then choose its FA team.'
      );
      return;
    }
    for (const key of Object.keys(this.settings.team_map)) {
      if (rc._tkey(key) === rc._tkey(name)) {
        delete this.settings.team_map[key];
      }
    }
    this.settings.team_map[name] = target === IGNORE_LABEL ? rc.IGNORE : target;
    this.onMappingChanged();
  }

  private removeSelectedMapping(): void {
    const name = this.selectedMappingTeam;
    if (!name) return;
    for (const key of Object.keys(this.settings.team_map)) {
      if (rc._tkey(key) === rc._tkey(name)) {
        delete this.settings.team_map[key];
      }
    }
    this.selectedMappingTeam = '';
    (this.root.querySelector('#map-selected-label') as HTMLElement).textContent = '(none selected)';
    this.onMappingChanged();
  }

  private addNewMappingTeam(): void {
    const input = this.root.querySelector('#input-new-map-team') as HTMLInputElement;
    const name = input.value.trim();
    if (!name) return;
    const exists = Object.keys(this.settings.team_map).some(
      (k) => rc._tkey(k) === rc._tkey(name)
    );
    if (!exists) {
      this.settings.team_map[name] = rc.IGNORE;
      input.value = '';
      this.selectedMappingTeam = name;
      (this.root.querySelector('#map-selected-label') as HTMLElement).textContent = name;
      this.persistSettings();
      this.renderMappingsTab();
      this.setStatus(`Added '${name}' as (ignore). Choose its FA team and click Apply.`);
    }
  }

  private suggestUnmappedTeams(quiet: boolean): number {
    const missing = this.unmappedTeams();
    const found = rc.suggest_mapping(missing, this.allKnownFaTeams());
    const count = Object.keys(found).length;
    Object.assign(this.settings.team_map, found);
    if (count > 0 && quiet) {
      this.persistSettings();
      this.renderMappingsTab();
    } else if (count > 0) {
      this.onMappingChanged();
    }
    if (!quiet) {
      this.setStatus(
        `Suggested ${count} mapping(s). ${missing.length - count} still need choosing.`
      );
    }
    return count;
  }

  // ------------------------------------------------------------------ Phone & WhatsApp (#21)

  private copyStaffPhone(kind: 'manager' | 'assistant'): void {
    if (!this.result || !this.settings.team) return;
    const phone = rc.staff_phones(this.result, this.settings.team, kind);
    if (!phone) {
      this.showMessageModal(
        'No phone number',
        `No ${kind} phone number for ${this.settings.team} in the managers file. Choose a managers file in Step 1 and click Reconcile again.`
      );
      return;
    }
    void this.copyText(phone, `Copied ${kind} phone for ${this.settings.team}: ${phone}`);
  }

  private openTeamWhatsAppModal(): void {
    if (!this.result || !this.settings.team) return;
    const label = this.settings.team;
    this.openConfirmModal('Data protection warning', WHATSAPP_WARNING, () => {
      if (!this.result) return;
      const medical = this.settings.medical;
      const squadMsgs = rc.whatsapp_squad(this.result, label);
      const parts: Array<[string, string]> = [
        ['Squad list', rc.whatsapp_squad_list(this.result, label)],
        ...squadMsgs.map((m, i): [string, string] => [
          squadMsgs.length > 1 ? `Squad ${i + 1}` : 'Squad',
          m,
        ]),
      ];
      const npMsgs = rc.whatsapp_not_paying(this.result, label);
      parts.push(...npMsgs.map((m, i): [string, string] => [npMsgs.length > 1 ? `Not paying ${i + 1}` : 'Not paying', m]));
      if (medical) {
        const medMsgs = rc.whatsapp_medical(this.result, label);
        parts.push(
          ...medMsgs.map(
            (m, i): [string, string] => [
              medMsgs.length > 1 ? `Medical ${i + 1}` : 'Medical',
              m,
            ]
          )
        );
      }
      this.showWhatsAppPartsModal(
        `Copy for WhatsApp: ${label}`,
        'Pick a tab, click Copy to clipboard, then paste into WhatsApp. You can edit the text first. Send the squad message and the medical message separately, and only to the people who need them.',
        parts,
        !medical ? 'Medical message left out (Include medical details is unticked).' : '',
        label
      );
    });
  }

  private openTeamPaymentWhatsAppModal(): void {
    if (!this.result || !this.settings.team) return;
    const label = this.settings.team;
    this.openConfirmModal('Data protection warning', WHATSAPP_WARNING, () => {
      if (!this.result) return;
      const npMsgs = rc.whatsapp_not_paying(this.result, label);
      const parts: Array<[string, string]> = npMsgs.map((m, i) => [
        npMsgs.length > 1 ? `Not paying ${i + 1}` : 'Not paying',
        m,
      ]);
      this.showWhatsAppPartsModal(
        `Copy payment for WhatsApp: ${label}`,
        'Players in this team who are missing from Thrive or have no active direct debit mandate. Click Copy to clipboard (or Share to app) to send to the team manager.',
        parts,
        '',
        label
      );
    });
  }

  private openNotPayingWhatsAppModal(): void {
    if (!this.result) return;
    this.openConfirmModal('Data protection warning', WHATSAPP_WARNING, () => {
      if (!this.result) return;
      const allLabel = 'All teams';
      const groups = rc.not_paying_by_team(this.result);
      const teams = Object.keys(groups);
      const totalUnpaid = Object.values(groups).reduce((n, members) => n + members.length, 0);

      const body = document.createElement('div');
      const hint = document.createElement('p');
      hint.className = 'view-desc';
      hint.textContent =
        "Choose all teams or one team (for example to send to that team's manager), then click Copy to clipboard and paste into WhatsApp. You can edit the text first.";
      body.appendChild(hint);

      const pickRow = document.createElement('div');
      pickRow.className = 'wa-team-pick-row';
      const lbl = document.createElement('label');
      lbl.textContent = 'Team';
      lbl.htmlFor = 'wa-np-team-select';
      const select = document.createElement('select');
      select.id = 'wa-np-team-select';
      select.className = 'wa-team-select';
      for (const t of [allLabel, ...teams]) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent =
          t === allLabel
            ? `${allLabel} — ${totalUnpaid} not paying`
            : contact.notPayingChoiceLabel(this.result, t, groups[t].length);
        select.appendChild(opt);
      }
      pickRow.append(lbl, select);
      body.appendChild(pickRow);

      const tabsBar = document.createElement('div');
      tabsBar.className = 'help-nav';
      const textarea = document.createElement('textarea');
      textarea.className = 'whatsapp-textarea';
      textarea.setAttribute('aria-label', 'WhatsApp message text');
      let sendRow = document.createElement('div');
      sendRow.className = 'wa-send-row';
      body.append(tabsBar, textarea, sendRow);

      let currentTexts: string[] = [];
      let activeIdx = 0;

      const renderMessages = () => {
        if (!this.result) return;
        const chosen = select.value === allLabel ? null : select.value;
        currentTexts = rc.whatsapp_not_paying(this.result, chosen);
        activeIdx = 0;
        tabsBar.innerHTML = '';
        currentTexts.forEach((_, idx) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent =
            currentTexts.length > 1 ? `Message ${idx + 1}` : 'Message';
          if (idx === activeIdx) b.className = 'btn-primary';
          b.addEventListener('click', () => {
            currentTexts[activeIdx] = textarea.value;
            activeIdx = idx;
            textarea.value = currentTexts[activeIdx];
          });
          tabsBar.appendChild(b);
        });
        textarea.value = currentTexts[0] || '';
        const team = chosen && chosen in this.result.teams ? chosen : null;
        const nextRow = this.buildManagerSendRow(team, () => textarea.value);
        sendRow.replaceWith(nextRow);
        sendRow = nextRow;
      };

      select.addEventListener('change', renderMessages);
      renderMessages();

      const footer = document.createElement('div');
      footer.className = 'modal-footer-split';
      const left = document.createElement('div');
      left.className = 'modal-footer-left';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-primary';
      copyBtn.textContent = 'Copy to clipboard';
      copyBtn.addEventListener('click', () => {
        void this.copyText(textarea.value.trim(), 'Copied. Paste it into WhatsApp.');
      });
      left.appendChild(copyBtn);

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        const shareBtn = document.createElement('button');
        shareBtn.type = 'button';
        shareBtn.className = 'btn-share-native';
        shareBtn.textContent = 'Share to app...';
        shareBtn.addEventListener('click', () => {
          void navigator.share({ text: textarea.value.trim() }).catch(() => {});
        });
        left.appendChild(shareBtn);
      }

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => this.closeModal());
      footer.append(left, closeBtn);

      this.openCustomModal('Copy for WhatsApp: not paying', body, footer);
    });
  }

  private showWhatsAppPartsModal(
    title: string,
    description: string,
    parts: Array<[string, string]>,
    footerNote = '',
    teamLabel: string | null = null
  ): void {
    const body = document.createElement('div');
    const descP = document.createElement('p');
    descP.className = 'view-desc wa-desc';
    descP.textContent = description;
    body.appendChild(descP);

    const tabsBar = document.createElement('div');
    tabsBar.className = 'help-nav';
    const textarea = document.createElement('textarea');
    textarea.className = 'whatsapp-textarea';
    textarea.setAttribute('aria-label', 'WhatsApp message text');
    body.append(tabsBar, textarea);

    const texts = parts.map(([, t]) => t);
    let activeIdx = 0;

    const updateTabButtons = () => {
      tabsBar.innerHTML = '';
      parts.forEach(([partTitle], idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = partTitle;
        if (idx === activeIdx) b.className = 'btn-primary';
        b.addEventListener('click', () => {
          texts[activeIdx] = textarea.value;
          activeIdx = idx;
          textarea.value = texts[activeIdx];
          updateTabButtons();
        });
        tabsBar.appendChild(b);
      });
    };

    textarea.value = texts[0] || '';
    updateTabButtons();
    body.appendChild(this.buildManagerSendRow(teamLabel, () => textarea.value));

    const footer = document.createElement('div');
    footer.className = 'modal-footer-split';

    const left = document.createElement('div');
    left.className = 'modal-footer-left';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-primary';
    copyBtn.textContent = 'Copy to clipboard';
    copyBtn.addEventListener('click', () => {
      void this.copyText(textarea.value.trim(), 'Copied. Paste it into WhatsApp.');
    });
    left.appendChild(copyBtn);

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'btn-share-native';
      shareBtn.textContent = 'Share to app...';
      shareBtn.addEventListener('click', () => {
        void navigator.share({ text: textarea.value.trim() }).catch(() => {});
      });
      left.appendChild(shareBtn);
    }

    if (footerNote) {
      const noteSpan = document.createElement('span');
      noteSpan.className = 'modal-footer-note';
      noteSpan.textContent = footerNote;
      left.appendChild(noteSpan);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.closeModal());

    footer.append(left, closeBtn);
    this.openCustomModal(title, body, footer);
  }

  /**
   * "Send to <Manager> on WhatsApp..." buttons: open wa.me straight into that manager's chat
   * with the message (as currently edited in the textarea) pre-filled. Nothing is sent until the
   * user presses send in WhatsApp.
   */
  private buildManagerSendRow(teamLabel: string | null, getText: () => string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'wa-send-row';
    if (!this.result || !teamLabel) return row;
    const managers = contact.managerContacts(this.result, teamLabel);
    if (managers.length === 0) {
      const note = document.createElement('p');
      note.className = 'wa-send-note';
      note.textContent = this.staff.length
        ? `No manager phone number for ${teamLabel} in the managers file, so it cannot open WhatsApp at their chat.`
        : 'Tip: add a managers file with phone numbers in Step 1 to get a "Send to manager on WhatsApp" button here.';
      row.appendChild(note);
      return row;
    }
    for (const m of managers) {
      const a = document.createElement('a');
      a.className = 'btn-whatsapp-send';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `Send to ${m.name} on WhatsApp...`;
      a.href = contact.whatsappLink(m.phone, getText()) || '#';
      a.title = `Opens WhatsApp (app or WhatsApp Web) at ${m.name}'s chat with this message ready. Check it, then press send.`;
      // Rebuild the link at click time so any edits to the text are included.
      a.addEventListener('click', () => {
        a.href = contact.whatsappLink(m.phone, getText()) || '#';
        this.setStatus(`Opening WhatsApp at ${m.name}'s chat. Check the message, then press send.`);
      });
      row.appendChild(a);
    }
    const note = document.createElement('p');
    note.className = 'wa-send-note';
    note.textContent =
      'Opens WhatsApp with this message ready to send. The message goes to WhatsApp in the link, so use it only for the intended manager.';
    row.appendChild(note);
    return row;
  }

  // ------------------------------------------------------------------ Excel & Zip Exports (#23)

  private exportFullWorkbook(): void {
    if (!this.result) return;
    this.openConfirmModal(
      'Data protection warning',
      export_warning(this.settings.medical),
      async () => {
        if (!this.result) return;
        const bytes = await (await loadExcelIo()).buildFullWorkbookBuffer(
          this.result,
          this.settings.team_map,
          this.faFile?.name || '',
          this.thriveFile?.name || '',
          this.settings.medical
        );
        const fileName = `Player_Reconciliation_${todayIsoDate()}.xlsx`;
        downloadBlob(
          bytes,
          fileName,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        this.setStatus(`Downloaded ${fileName}`);
      }
    );
  }

  private exportCurrentTeam(): void {
    if (!this.result || !this.settings.team) return;
    const label = this.settings.team;
    this.openConfirmModal(
      'Data protection warning',
      export_warning(this.settings.medical),
      async () => {
        if (!this.result) return;
        const bytes = await (await loadExcelIo()).buildTeamWorkbookBuffer(
          this.result,
          label,
          this.settings.medical
        );
        const safe = label
          .replace(/[^\w\- ]+/g, '')
          .trim()
          .replace(/\s+/g, '_');
        const fileName = `Team_${safe}_${todayIsoDate()}.xlsx`;
        downloadBlob(
          bytes,
          fileName,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        this.setStatus(`Downloaded ${fileName}`);
      }
    );
  }

  private exportEachTeamZip(): void {
    if (!this.result) return;
    this.openConfirmModal(
      'Data protection warning',
      export_warning(this.settings.medical),
      async () => {
        if (!this.result) return;
        const { zipBytes, files } = await (await loadExcelIo()).buildEachTeamZipBuffer(
          this.result,
          this.settings.medical
        );
        const zipName = `Team_files_${todayIsoDate()}.zip`;
        downloadBlob(zipBytes, zipName, 'application/zip');
        this.setStatus(
          `Downloaded ${zipName} (${Object.keys(files).length} team files)`
        );
      }
    );
  }

  /** Every team with its coaches and players (in FA, in Thrive, paying) as a PDF on the club template. */
  private exportClubPdf(): void {
    if (!this.result && !this.coaches) return;
    this.openConfirmModal('Data protection warning', export_warning(false), async () => {
      if (!this.result && !this.coaches) return;
      const clubPdf = await import('./club_pdf');
      let officials: import('./club_pdf').Official[] = [];
      if (this.staffFile) {
        // managers or club officials file, for the officials page; a file that cannot be read is skipped
        try {
          const sheets = await (await loadExcelIo()).readWorkbookSheets(this.staffFile.buffer, this.staffFile.name);
          officials = clubPdf.parse_officials(sheets);
        } catch {
          officials = [];
        }
      }
      const bytes = await clubPdf.buildClubPdf(this.result, new Date(), officials, this.coaches);
      const fileName = `Teams_and_players_${todayIsoDate()}.pdf`;
      downloadBlob(bytes, fileName, 'application/pdf');
      this.setStatus(`Downloaded ${fileName}`);
    });
  }

  private exportNotPayingList(): void {
    if (!this.result) return;
    this.openConfirmModal('Data protection warning', export_warning(false), async () => {
      if (!this.result) return;
      const bytes = await (await loadExcelIo()).buildNotPayingWorkbookBuffer(this.result);
      const fileName = `Not_Paying_${todayIsoDate()}.xlsx`;
      downloadBlob(
        bytes,
        fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      this.setStatus(`Downloaded ${fileName}`);
    });
  }

  private exportConsentsList(): void {
    if (!this.result) return;
    this.openConfirmModal('Data protection warning', export_warning(false), async () => {
      if (!this.result) return;
      const bytes = await (await loadExcelIo()).buildConsentsWorkbookBuffer(this.result);
      const fileName = `Missing_Consents_${todayIsoDate()}.xlsx`;
      downloadBlob(
        bytes,
        fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      this.setStatus(`Downloaded ${fileName}`);
    });
  }

  // ------------------------------------------------------------------ Modals & Help (#24)

  private openCustomModal(title: string, bodyEl: HTMLElement, footerEl: HTMLElement): void {
    const backdrop = this.root.querySelector('#modal-backdrop') as HTMLElement;
    const titleEl = this.root.querySelector('#modal-title') as HTMLElement;
    const bodyContainer = this.root.querySelector('#modal-body') as HTMLElement;
    const footerContainer = this.root.querySelector('#modal-footer') as HTMLElement;

    const wasOpen = !backdrop.hidden;
    if (!wasOpen) {
      const active = document.activeElement as HTMLElement | null;
      this.modalReturnFocus = active && active !== document.body ? active : null;
    }
    titleEl.textContent = title;
    bodyContainer.innerHTML = '';
    bodyContainer.appendChild(bodyEl);
    footerContainer.innerHTML = '';
    footerContainer.appendChild(footerEl);
    backdrop.hidden = false;

    // Move focus into the dialog: the main button if there is one, else the first control, else the dialog
    const dialog = backdrop.querySelector('.modal-dialog') as HTMLElement;
    const target =
      (footerContainer.querySelector('.btn-primary') as HTMLElement | null) ||
      (dialog.querySelector(FOCUSABLE) as HTMLElement | null);
    if (target) {
      target.focus();
    } else {
      dialog.tabIndex = -1;
      dialog.focus();
    }
  }

  public closeModal(): void {
    const backdrop = this.root.querySelector('#modal-backdrop') as HTMLElement;
    if (!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
    const back = this.modalReturnFocus;
    this.modalReturnFocus = null;
    if (back && back.isConnected && typeof back.focus === 'function') {
      back.focus();
    }
  }

  /** Keep Tab and Shift+Tab inside an open dialog. */
  private trapModalFocus(e: KeyboardEvent): void {
    const backdrop = this.root.querySelector('#modal-backdrop') as HTMLElement;
    if (!backdrop || backdrop.hidden) return;
    const items = Array.from(backdrop.querySelectorAll(FOCUSABLE)).filter(
      (el) => !(el as HTMLElement).hidden && !(el as HTMLElement).closest('[hidden]')
    ) as HTMLElement[];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = active ? backdrop.contains(active) : false;
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  }

  private openProgressModal(): void {
    const body = document.createElement('div');
    const p1 = document.createElement('p');
    p1.className = 'progress-lead-text';
    p1.textContent = 'Comparing the FA report with the Thrive export...';
    const stepText = document.createElement('p');
    stepText.id = 'progress-modal-step-text';
    stepText.textContent = `Step 1 of ${PROGRESS_STEPS.length}: ${PROGRESS_STEPS[0]}...`;

    const progressEl = document.createElement('progress');
    progressEl.className = 'progress-native';
    progressEl.id = 'progress-modal-bar-inner';
    progressEl.max = 100;
    progressEl.value = 10;

    const note = document.createElement('p');
    note.className = 'view-desc';
    note.textContent = 'Nothing is uploaded and nothing is changed in Thrive or the FA system.';

    body.append(p1, stepText, progressEl, note);
    const footer = document.createElement('div');
    this.openCustomModal('Reconciling', body, footer);
  }

  private updateProgressStep(idx: number): void {
    const stepText = this.root.querySelector('#progress-modal-step-text') as HTMLElement | null;
    const progressEl = this.root.querySelector('#progress-modal-bar-inner') as HTMLProgressElement | null;
    const n = PROGRESS_STEPS.length;
    if (stepText && PROGRESS_STEPS[idx]) {
      stepText.textContent = `Step ${idx + 1} of ${n}: ${PROGRESS_STEPS[idx]}...`;
    }
    if (progressEl) {
      progressEl.value = Math.round(((idx + 0.5) / n) * 100);
    }
  }

  private openRowDetailModal(headers: string[], values: string[]): void {
    const body = document.createElement('div');
    const dl = document.createElement('dl');
    dl.className = 'detail-dl';
    headers.forEach((h, i) => {
      const val = (values[i] || '').trim();
      if (!val) return;
      const dt = document.createElement('dt');
      dt.textContent = h;
      const dd = document.createElement('dd');
      dd.textContent = val;
      dl.append(dt, dd);
    });
    body.appendChild(dl);

    const footer = document.createElement('div');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.closeModal());
    footer.appendChild(closeBtn);

    this.openCustomModal('Details', body, footer);
  }

  private openTeamPlayerDetailModal(headers: string[], values: unknown[]): void {
    const data: Record<string, string> = {};
    headers.forEach((h, i) => {
      data[h] = rc.cellDateOrStr(values[i]).trim();
    });

    const body = document.createElement('div');
    for (const [section, fields] of rc.TEAM_DETAIL_SECTIONS) {
      if (!fields.some((f) => f in data)) continue; // e.g., medical left out
      const h3 = document.createElement('div');
      h3.className = 'detail-section-heading';
      h3.textContent = section;
      body.appendChild(h3);

      const present = fields.filter((f) => Boolean(data[f]));
      if (present.length === 0) {
        const emptyP = document.createElement('p');
        emptyP.className = 'detail-empty-note';
        emptyP.textContent = 'Nothing recorded';
        body.appendChild(emptyP);
      } else {
        const dl = document.createElement('dl');
        dl.className = 'detail-dl';
        for (const f of present) {
          const dt = document.createElement('dt');
          dt.textContent = f;
          const dd = document.createElement('dd');
          dd.textContent = data[f];
          if (f === 'Medical info?' && data[f] === 'Yes') {
            dd.className = 'detail-alert';
          }
          dl.append(dt, dd);
        }
        body.appendChild(dl);
      }
    }

    const footer = document.createElement('div');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.closeModal());
    footer.appendChild(closeBtn);

    this.openCustomModal(`Player details: ${data['Player'] || ''}`, body, footer);
  }

  public showHelp(sectionKey = 'quick'): void {
    const body = document.createElement('div');
    const nav = document.createElement('div');
    nav.className = 'help-nav';

    for (const [key, title] of HELP_SECTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = title;
      btn.addEventListener('click', () => {
        const target = body.querySelector(`#help-sec-${key}`) as HTMLElement | null;
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      nav.appendChild(btn);
    }
    body.appendChild(nav);

    for (const [key, title, content] of HELP_SECTIONS) {
      const sec = document.createElement('section');
      sec.className = 'help-section';
      sec.id = `help-sec-${key}`;
      const h3 = document.createElement('h3');
      h3.textContent = title;
      const pre = document.createElement('pre');
      const urlRegex = /(https:\/\/[^\s)]+)/g;
      let lastIdx = 0;
      let match: RegExpExecArray | null;
      while ((match = urlRegex.exec(content)) !== null) {
        if (match.index > lastIdx) {
          pre.appendChild(document.createTextNode(content.slice(lastIdx, match.index)));
        }
        const link = document.createElement('a');
        link.href = match[1];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = match[1];
        pre.appendChild(link);
        lastIdx = match.index + match[1].length;
      }
      if (lastIdx < content.length) {
        pre.appendChild(document.createTextNode(content.slice(lastIdx)));
      }
      sec.append(h3, pre);
      body.appendChild(sec);
    }

    const footer = document.createElement('div');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.closeModal());
    footer.appendChild(closeBtn);

    this.openCustomModal(`${rc.APP_TITLE} Help`, body, footer);
    setTimeout(() => {
      const target = body.querySelector(`#help-sec-${sectionKey}`) as HTMLElement | null;
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'start' });
      }
    }, 20);
  }

  private showAbout(): void {
    const body = document.createElement('div');
    const pre = document.createElement('pre');
    pre.className = 'modal-message-pre';
    pre.textContent = `${rc.APP_TITLE}\nVersion ${rc.VERSION} (Web App — created ${rc.BUILD_DATETIME})\n\nCompares the FA player registration report with the Thrive export, flags data quality problems and produces team sheets for managers.\n\nWorks entirely in your browser on your computer. Nothing is uploaded or sent anywhere.`;
    const details = document.createElement('details');
    details.className = 'changelog';
    const summary = document.createElement('summary');
    summary.textContent = "What's new (changelog)";
    details.append(summary, renderChangelog(changelogText));
    body.append(pre, details);
    const footer = document.createElement('div');
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn-primary';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => this.closeModal());
    footer.appendChild(okBtn);
    this.openCustomModal(`About ${rc.APP_TITLE}`, body, footer);
  }

  private showMessageModal(title: string, message: string): void {
    const body = document.createElement('div');
    const pre = document.createElement('pre');
    pre.className = 'modal-message-pre';
    pre.textContent = message;
    body.appendChild(pre);

    const footer = document.createElement('div');
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn-primary';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => this.closeModal());
    footer.appendChild(okBtn);

    this.openCustomModal(title, body, footer);
  }

  private openConfirmModal(title: string, message: string, onConfirm: () => void | Promise<void>): void {
    const body = document.createElement('div');
    const pre = document.createElement('pre');
    pre.className = 'modal-message-pre';
    pre.textContent = message;
    body.appendChild(pre);

    const footer = document.createElement('div');
    footer.className = 'modal-footer-right';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.closeModal());

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn-primary';
    okBtn.textContent = 'Continue';
    okBtn.addEventListener('click', () => {
      this.closeModal();
      void (async () => {
        try {
          await onConfirm();
        } catch (exc) {
          const msg = exc instanceof Error ? exc.message : String(exc);
          this.setStatus('Something went wrong. Nothing was saved.');
          this.showMessageModal('Something went wrong', `That did not work:\n${msg}\n\nNothing was saved. Try again, or reconcile again first.`);
        }
      })();
    });

    footer.append(cancelBtn, okBtn);
    this.openCustomModal(title, body, footer);
  }
}
