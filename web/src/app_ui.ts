/**
 * Interactive client-side UI controller for Player Reconciliation (Web App).
 * Implements issues #18, #19, #20, #21, #22, #23, #24.
 */
import * as rc from './reconcile_core';
import * as excelIo from './excel_io';
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
import { loadFilesWithSteps, LoadedFilesPayload, ReconcileInput } from './reconcile_runner';

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

  faPlayers: rc.FAPlayer[] | null = null;
  thrivePlayers: rc.ThrivePlayer[] | null = null;
  staff: rc.Staff[] = [];
  missingItems: Array<[string, string]> = [];
  result: rc.Result | null = null;
  runFilesKey: string | null = null;
  busy = false;

  activeTab: 'results' | 'teams' | 'not-paying' | 'consents' | 'mappings' = 'results';
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

  constructor(root: HTMLElement, storage: Storage = window.localStorage) {
    this.root = root;
    this.storage = storage;
    this.settings = settingsMod.loadSettings(this.storage);
    this.renderShell();
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
    ].join('|');
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <header class="app-header">
        <div class="app-brand">
          <img src="./logo_32.png" alt="" aria-hidden="true" />
          <h1>${rc.APP_TITLE}: FA vs Thrive</h1>
          <span class="app-version-badge" id="version-badge">v${rc.VERSION}</span>
        </div>
        <nav class="app-nav-actions" aria-label="Application menu">
          <button type="button" id="nav-help-quick">How to use (F1)</button>
          <button type="button" id="nav-help-exports">Getting the exports</button>
          <button type="button" id="nav-help-privacy">Data protection</button>
          <a href="./PlayerReconcile-web-offline.zip" download="PlayerReconcile-web-offline.zip" class="nav-download-link" id="nav-offline-zip" title="Download the web app as a zip to run locally offline">Download offline copy (.zip)</a>
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
            <h2 class="step-card-title">Step 1: choose your two files (or drag and drop)</h2>
            <button type="button" class="btn-link" id="step1-howto-link">How to get these files</button>
          </div>
          <div class="file-rows">
            <div class="file-drop-row" id="drop-fa">
              <label for="input-fa">FA registration report</label>
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
          </div>
          <div class="step1-actions">
            <span>Files are read in your browser and never uploaded.</span>
            <button type="button" id="btn-staff-template">Managers template...</button>
          </div>
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
          <label class="checkbox-row">
            <input type="checkbox" id="chk-medical" />
            <span>Include medical details</span>
          </label>
        </div>
      </section>

      <div class="hint-banner" id="hint-banner" role="status" aria-live="polite">
        Start here: choose your FA report and your Thrive export in Step 1, then click Reconcile.
      </div>

      <!-- Main Tabs -->
      <main class="tabs-container">
        <div class="tablist" role="tablist" aria-label="Reconciliation sections">
          <button type="button" role="tab" class="tab-btn" id="tab-btn-results" aria-selected="true" aria-controls="panel-results" data-tab="results">Results</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-teams" aria-selected="false" aria-controls="panel-teams" data-tab="teams">Team sheets</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-not-paying" aria-selected="false" aria-controls="panel-not-paying" data-tab="not-paying">Not paying</button>
          <button type="button" role="tab" class="tab-btn" id="tab-btn-consents" aria-selected="false" aria-controls="panel-consents" data-tab="consents">Missing consents</button>
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
        <span id="status-bar-text">Version ${rc.VERSION}   |   Not reconciled yet</span>
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
      this.onFilesModified();
    });

    this.root.querySelector('#btn-staff-template')?.addEventListener('click', async () => {
      const bytes = await excelIo.buildStaffTemplateBuffer();
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
      if (e.key === 'Escape' && !this.busy) {
        const backdrop = this.root.querySelector('#modal-backdrop') as HTMLElement;
        if (backdrop && !backdrop.hidden) {
          this.closeModal();
        }
      } else if (e.key === 'F1') {
        e.preventDefault();
        this.showHelp('quick');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
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
    slot: 'fa' | 'thrive' | 'staff',
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

  public setChosenFilesForTest(fa: ChosenFile | null, thrive: ChosenFile | null, staff: ChosenFile | null = null): void {
    this.faFile = fa;
    this.thriveFile = thrive;
    this.staffFile = staff;
    this.onFilesModified();
  }

  private updateFileSlotsUI(): void {
    const slots: Array<['fa' | 'thrive' | 'staff', ChosenFile | null, string]> = [
      ['fa', this.faFile, 'No file chosen (tap or drop .xlsx)'],
      ['thrive', this.thriveFile, 'No file chosen (tap or drop .xlsx)'],
      ['staff', this.staffFile, 'Optional (.xlsx or .csv)'],
    ];
    for (const [id, file, emptyText] of slots) {
      const statusBox = this.root.querySelector(`#status-${id}`) as HTMLElement;
      const clearBtn = this.root.querySelector(`#clear-${id}`) as HTMLButtonElement;
      if (file) {
        statusBox.textContent = file.name;
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
      'mappings',
    ];
    for (const p of panels) {
      const panelEl = this.root.querySelector(`#panel-${p}`) as HTMLElement;
      if (panelEl) panelEl.hidden = p !== tab;
    }
  }

  // ------------------------------------------------------------------ Reconcile (#18)

  public async runReconcile(): Promise<void> {
    if (!this.faFile || !this.thriveFile) {
      this.showMessageModal(
        'Choose your files',
        'Please choose both files first:\n\n  • the FA registration report\n  • the Thrive data export'
      );
      return;
    }
    if (this.busy) return;
    this.busy = true;
    this.openProgressModal();

    const input: ReconcileInput = {
      faBuffer: this.faFile.buffer,
      faName: this.faFile.name,
      thriveBuffer: this.thriveFile.buffer,
      thriveName: this.thriveFile.name,
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
              reject(new Error(data.message));
            }
          };
          worker.onerror = (err) => {
            worker.terminate();
            reject(err);
          };
          worker.postMessage(input);
        });
      } catch {
        // Fallback if Worker URL resolution isn't available in test environment
      }
    }
    return loadFilesWithSteps(input, (step) => this.updateProgressStep(step));
  }

  private computeResult(): rc.Result {
    const res = rc.reconcile(
      this.faPlayers || [],
      this.thrivePlayers || [],
      this.settings.team_map,
      this.settings.fuzzy
    );
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
      (el as HTMLElement).hidden = true;
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
      opt.textContent = rc.team_choice_label(res, label);
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
    let msg = `Compared ${this.faPlayers?.length || 0} FA players with ${this.thrivePlayers?.length || 0} Thrive players. Pick a view on the left of the Results tab. Click any row for the full details.`;
    if (addedCount > 0) {
      msg += ` ${addedCount} new Thrive team(s) were matched automatically.`;
    }
    if (unmapped.length > 0) {
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
      `Reconciled at ${todayStr}   |   ${this.faFile?.name || ''}   |   ${this.thriveFile?.name || ''}`
    );

    const notices: string[] = [];
    if (loaded.swapped) {
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
      statsEl.textContent = `${counts['Matched'] || 0} fully matched   |   ${attention} need attention`;
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
        labelSpan.textContent = title;
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
        opt.textContent = this.result ? `${title} (${count})` : title;
        optGroup.appendChild(opt);

        if (title === this.currentView) {
          (this.root.querySelector('#results-view-title') as HTMLElement).textContent = title;
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
    for (const [title, attr] of rc.COLUMNS) {
      const th = document.createElement('th');
      const arrow =
        this.resultsSort.col === attr ? (this.resultsSort.desc ? ' ▼' : ' ▲') : '';
      th.textContent = title + arrow;
      th.addEventListener('click', () => {
        if (this.resultsSort.col === attr) {
          this.resultsSort.desc = !this.resultsSort.desc;
        } else {
          this.resultsSort = { col: attr, desc: false };
        }
        this.renderResultsTable();
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
      th.addEventListener('click', () => {
        if (this.teamSort.col === idx) {
          this.teamSort.desc = !this.teamSort.desc;
        } else {
          this.teamSort = { col: idx, desc: false };
        }
        this.renderTeamTab();
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
      `${rawRows.length} players: ${sourceCounts['Both']} in both, ${sourceCounts['FA only']} FA only, ${sourceCounts['Thrive only']} Thrive only` +
      (sourceCounts[rc.NO_FA] ? `, ${sourceCounts[rc.NO_FA]} no FA needed` : '') +
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
      } else if (item.source === 'Thrive only') {
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
    for (const colIdx of visibleColIndices) {
      const th = document.createElement('th');
      const arrow =
        sortState.col === colIdx ? (sortState.desc ? ' ▼' : ' ▲') : '';
      th.textContent = headers[colIdx] + arrow;
      th.addEventListener('click', () => {
        if (sortState.col === colIdx) {
          onSortChange({ col: colIdx, desc: !sortState.desc });
        } else {
          onSortChange({ col: colIdx, desc: false });
        }
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
      .filter((t) => !known.has(rc._tkey(t)))
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
      if (key === undefined) {
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
    void navigator.clipboard?.writeText(phone);
    this.setStatus(`Copied ${kind} phone for ${this.settings.team}: ${phone}`);
  }

  private openTeamWhatsAppModal(): void {
    if (!this.result || !this.settings.team) return;
    const label = this.settings.team;
    this.openConfirmModal('Data protection warning', WHATSAPP_WARNING, () => {
      if (!this.result) return;
      const medical = this.settings.medical;
      const squadMsgs = rc.whatsapp_squad(this.result, label);
      const parts: Array<[string, string]> = squadMsgs.map((m, i) => [
        squadMsgs.length > 1 ? `Squad ${i + 1}` : 'Squad',
        m,
      ]);
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
        !medical ? 'Medical message left out (Include medical details is unticked).' : ''
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
        parts
      );
    });
  }

  private openNotPayingWhatsAppModal(): void {
    if (!this.result) return;
    this.openConfirmModal('Data protection warning', WHATSAPP_WARNING, () => {
      if (!this.result) return;
      const allLabel = 'All teams';
      const teams = Object.keys(rc.not_paying_by_team(this.result));

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
        opt.textContent = t === allLabel ? allLabel : rc.team_choice_label(this.result, t);
        select.appendChild(opt);
      }
      pickRow.append(lbl, select);
      body.appendChild(pickRow);

      const tabsBar = document.createElement('div');
      tabsBar.className = 'help-nav';
      const textarea = document.createElement('textarea');
      textarea.className = 'whatsapp-textarea';
      textarea.setAttribute('aria-label', 'WhatsApp message text');
      body.append(tabsBar, textarea);

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
        void navigator.clipboard?.writeText(textarea.value.trim());
        this.setStatus('Copied. Paste it into WhatsApp.');
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
    footerNote = ''
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

    const footer = document.createElement('div');
    footer.className = 'modal-footer-split';

    const left = document.createElement('div');
    left.className = 'modal-footer-left';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-primary';
    copyBtn.textContent = 'Copy to clipboard';
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard?.writeText(textarea.value.trim());
      this.setStatus('Copied. Paste it into WhatsApp.');
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

  // ------------------------------------------------------------------ Excel & Zip Exports (#23)

  private exportFullWorkbook(): void {
    if (!this.result) return;
    this.openConfirmModal(
      'Data protection warning',
      export_warning(this.settings.medical),
      async () => {
        if (!this.result) return;
        const bytes = await excelIo.buildFullWorkbookBuffer(
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
        const bytes = await excelIo.buildTeamWorkbookBuffer(
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
        const { zipBytes, files } = await excelIo.buildEachTeamZipBuffer(
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

  private exportNotPayingList(): void {
    if (!this.result) return;
    this.openConfirmModal('Data protection warning', export_warning(false), async () => {
      if (!this.result) return;
      const bytes = await excelIo.buildNotPayingWorkbookBuffer(this.result);
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
      const bytes = await excelIo.buildConsentsWorkbookBuffer(this.result);
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

    titleEl.textContent = title;
    bodyContainer.innerHTML = '';
    bodyContainer.appendChild(bodyEl);
    footerContainer.innerHTML = '';
    footerContainer.appendChild(footerEl);
    backdrop.hidden = false;
  }

  public closeModal(): void {
    const backdrop = this.root.querySelector('#modal-backdrop') as HTMLElement;
    if (backdrop) backdrop.hidden = true;
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
      pre.textContent = content;
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
    this.showMessageModal(
      `About ${rc.APP_TITLE}`,
      `${rc.APP_TITLE}\nVersion ${rc.VERSION} (Web App)\n\nCompares the FA player registration report with the Thrive export, flags data quality problems and produces team sheets for managers.\n\nWorks entirely in your browser on your computer. Nothing is uploaded or sent anywhere.`
    );
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
      void onConfirm();
    });

    footer.append(cancelBtn, okBtn);
    this.openCustomModal(title, body, footer);
  }
}
