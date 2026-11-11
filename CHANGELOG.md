# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Client-side web app (`web/`) running the reconciliation entirely in the visitor's browser with TypeScript, Vite, ExcelJS and `fflate`:
  - Privacy and security baseline (#13, #14): strict Content Security Policy (`connect-src 'none'`, `form-action 'none'`), no third-party CDNs or trackers, and `localStorage` restricted to user settings only (never player data)
  - Full port of file loading, column checks and the reconciliation engine (#15, #16), verified by a shared cross-engine parity test suite (`tests/parity/expected_parity.json`, `tests/test_parity.py`, `web/tests/parity.test.ts`) and a local real-export comparison script (`scripts/compare_real_exports.py`) (#17)
  - Responsive web interface (#18, #19, #20, #21, #22, #23, #24): Step 1 to 3 file pickers and drag-and-drop with Web Worker progress, Results views, Team sheets, Not paying, Missing consents, Team mappings with JSON settings export and import, Copy for WhatsApp, styled Excel and `.zip` exports (with printable Matchday sheets), built-in help and automated WCAG 2.1 AA accessibility checks (`axe-core`)
  - GitHub Pages deployment workflow (`.github/workflows/deploy-web.yml`) and downloadable offline `.zip` bundle (`PlayerReconcile-web-offline.zip`) (#25)

## [1.2.0] - 2026-11-11

### Added
- Missing consents: a new tab, Excel export and full-workbook sheet listing players in Thrive without photography, code of conduct or club rules consent (blank, No, declined and similar), photography first, with the answer shown. Only consents present in the export are checked. Team sheets gain a Consents column, team Excel files a Consents missing column, and the WhatsApp squad message warns about players without photography consent
- Matchday sheet: every team file (Export team files for managers, Export this team) now opens on a print-ready sheet (A4 landscape, one page wide, header repeated) with a Here column, parent contact and phone, emergency contact, highlighted medical alerts and Photos OK, plus blank lines for date, opponent, venue and kick-off
- Automated tests (`tests/`, pytest) using invented sample exports: loading and missing columns, reconciliation, consents, exports including the matchday sheet, and the GUI end to end. They run in the pipeline on every pull request and before every build
- Help > Getting the exports (and a "How to get these files" link in the Step 1 heading): step by step for the FA player report and the Thrive export, including every Thrive Manage table columns item to add

### Changed
- A Thrive export with missing columns is handled. If Name, Date of birth or Teams is missing, the error names the Manage table columns items to add. Any other missing item no longer stops the comparison: a message lists what is missing and what it is used for
- Without the mandate column (Active pre-authorisation), paying shows as Unknown instead of everyone being flagged as not paying, and the Not paying tab explains why

## [1.1.2] - 2026-11-09

### Changed
- Team sheets make non-payers obvious: the Paying column is now next to the name and says "✖ NOT PAYING (reason)" or "✔ Yes", non-payers have a strong red row in bold (with a key chip), the number not paying is shown in red above the list, and "Show only not paying" lists just them

## [1.1.1] - 2026-11-09

### Changed
- Not paying tab hides columns that are empty for every player, and says which ones. Exports are unaffected

### Fixed
- U4, U5, U6 and training groups are no longer treated as missing from the FA system. They show as "No FA needed" (grey) on team sheets, Not paying and the Excel files, and as "FA not needed" in WhatsApp messages. They are still checked for an active mandate and appear on Not paying without one
- New Results view "No FA team (U4-U6, training)"; "In Thrive, not in FA" now lists only players who should be registered with the FA
- U04 added to the default team mappings as a group with no FA team
- Build pipeline uses the Node 24 versions of the GitHub actions (checkout v7, setup-python v7, upload-artifact v7, download-artifact v8), removing the Node 20 deprecation warning

## [1.1.0] - 2026-11-09

### Changed
- Team sheets tab shows a compact list (player, age, where registered, FA status, mandate, main contact, medical Yes/No, note). Double-click or Enter opens all details grouped into Player, Contacts, Medical and Consents. Excel exports are unchanged
- Layout works in a smaller window (minimum 960x620): Team sheets buttons on their own row, text wraps to the window, Team mappings edit controls stay visible, dialog buttons stay visible
- Table columns are sized to their contents and row height follows the font, so text is not clipped at higher display scaling

### Added
- Previous / next team arrows on Team sheets (also Alt+Left / Alt+Right), with "n of N"
- "Not reconciled yet" notice on every results table until the first run, and a "Files changed" warning in Step 2 if different files are chosen after a run
- Progress window during Reconcile; files are read and compared in the background so the window stays responsive
- Copy for WhatsApp on the Not paying tab: name, team, in FA, in Thrive and active mandate for each player, for all teams or one team
- Search box on Team sheets (searches every field, including phones, emails and conditions) and on Not paying
- Click a column heading to sort on Team sheets and Not paying; numbers and dates sort by value
- Players with medical information show in red with a warning sign on Team sheets
- "Paying" column on Team sheets, and "Paying through Thrive" on team Excel files: Yes, no active mandate, or not in Thrive
- Remembers the window size and position, maximised state, last tab and last team between runs

## [1.0.0] - 2026-11-09

First release.

- Reconcile the FA player registration report with the Thrive data export by name and date of birth, with fuzzy name matching
- Results views: all players, needs attention, in Thrive not in FA, in FA not in Thrive, check match, team differs, data quality
- Data quality flags: adult date of birth, name matching a parent or carer, player too old for team, odd capitalisation, missing date of birth, possible duplicates
- Configurable Thrive to FA team mappings with defaults and suggestions for new teams
- Team sheets for managers with contacts, medical information and consents, coloured by FA, Thrive or both
- Not paying list for players with no active mandate or not in Thrive
- Excel export: full workbook with a sheet per team, a single team, or one file per team in a dated folder
- Option to leave medical details out of exports
- Data protection: a permanent UK GDPR banner in the app, a warning each time any export is clicked, and a confidentiality line on every exported sheet
- Easier use: find latest exports in Downloads, wrong-way-round file detection, help, tooltips, details window for any row
- Copy for WhatsApp: plain text for a team with squad, contacts, FA and Thrive sign-up status and direct debit status, plus a separate medical message, each with a data protection footnote and split into parts if long
- Optional managers file (Excel or CSV, two layouts) so manager and assistant manager names appear on team sheets, Excel files and WhatsApp text, with a template to fill in and a warning for teams with no manager
- Copy manager phone and Copy assistant phone buttons on the Team sheets tab
- Build and release pipeline that publishes the Windows exe from a version tag
