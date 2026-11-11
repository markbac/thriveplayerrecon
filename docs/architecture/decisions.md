# Architecture decisions

Short records of the main choices, with the reasons and what was given up.

## 1. A Windows desktop app packaged as a single exe

**Decision:** Python with tkinter, packaged with PyInstaller as one exe.

**Why:** The users are volunteers on ordinary PCs. A downloaded exe needs no installer, runtime or admin rights. The data is about children, so keeping all processing on the user's own machine avoids hosting, accounts and a new data processor.

**Alternatives:** a web app (hosting and data protection burden), a .NET desktop app (heavier toolchain for the maintainer), Excel macros (hard to maintain and version), Electron (large and unnecessary).

**Cost:** tkinter looks plain, and the exe is larger than a native one. Windows only.

## 2. Match on name and date of birth with fuzzy names

**Decision:** Pair players by name and date of birth, tolerating nicknames, typos, extra names and swapped names.

**Why:** Thrive does not hold the FAN ID, and the real data contains Sam and Samuel, typos and wrong dates.

**Cost:** two people with the same name and date of birth cannot be separated. See [matching algorithm](matching-algorithm.md).

## 3. Only an exact match counts as matched

**Decision:** Any difference in name or date of birth is shown as Check match with both values.

**Why:** A wrong automatic match is worse than a visible doubt. People confirm, and fix the source.

**Cost:** more rows to review. Manual overrides are a planned improvement.

## 4. Engine separate from GUI

**Decision:** `reconcile_core.py` contains all logic and imports no GUI code. `app.py` only presents it.

**Why:** The logic can be run without a display, tested, and reused by another front end. It also keeps each file focused.

## 5. One file per team for sharing

**Decision:** The main sharing action writes a separate Excel file per team into a dated folder.

**Why:** Each manager only needs their own players. Sending a single workbook would expose every team's contacts and medical details to everyone.

## 6. Medical details are optional and flagged

**Decision:** A checkbox leaves medical information out of team sheets and exports. A permanent banner reminds users of UK GDPR, and a warning appears on every export click, naming medical information when it is included.

**Why:** Medical details are special category data. Managers need them, but only when they are needed and securely handled.

## 7. Settings in the user profile, defaults in code

**Decision:** Settings are saved as JSON in `%APPDATA%\PlayerReconcile`. The default team mapping is in code and can be restored from the app.

**Why:** Settings are per user and survive upgrades. The settings file holds no player data, so it is safe to leave in place.

## 8. Single-sourced version and tag-driven release

**Decision:** The version lives in `src/version.py`. A release is made by pushing a matching `v` tag, and GitHub Actions builds and publishes the exe.

**Why:** A release is repeatable and not dependent on one person's machine. The build fails if the tag and version disagree. Only GitHub's own actions and the `gh` command line are used, to keep the supply chain small.

## 9. The exe is not code signed

**Decision:** Releases are unsigned. A SHA-256 checksum is published.

**Why:** Certificates cost money and need identity checks. Users are told what the SmartScreen warning means.

**Revisit:** if the tool is shared with other clubs.

## 10. No unit tests yet

**Decision:** The first release has no test suite. The pipeline runs a start-up self-test of the built exe only.

**Why:** A deliberate scope choice for the first release.

**Cost:** regressions in matching rules are caught only by use. Adding tests for the engine is the next quality step, and the engine is already free of GUI code so that is straightforward.

## 11. WhatsApp text and an optional managers file

**Decision:** Managers do not have the tool, so it produces plain text for the administrator to copy and paste into WhatsApp: a squad message and a separate medical message, each with a data protection footnote. Manager names come from an optional Excel or CSV file read in two layouts.

**Why:** Plain text is easy to copy, works on any phone and needs no attachment. Medical data is kept in its own message so it can go to fewer people. A tolerant loader suits a file the club writes by hand, and a template removes guesswork.

**Cost:** WhatsApp copies the data onto every device in the chat, outside the club's control. The tool warns before showing the text and the guidance says to send it only to the people who need it.

## 12. Client-side web app built with TypeScript in `web/`

**Decision:** Offer the tool as a static, 100 percent client-side web app in `web/` inside this repository, written in TypeScript with Vite and Vitest, using ExcelJS for reading and styled Excel exports and `fflate` for zip downloads, with no UI framework.

**Why:**
- **Engine port vs Pyodide:** Porting `reconcile_core.py` to TypeScript keeps the download small (hundreds of kilobytes instead of a 15 to 25 MB WebAssembly Python runtime), starts instantly, works offline from a local zip, and avoids fetching external runtime assets under a strict Content Security Policy. A shared parity test suite (`tests/parity/`) runs against both the Python and TypeScript engines in CI so results cannot drift.
- **TypeScript and no framework:** Static types catch date, null and structure mismatches in the matching and reporting port. The interface is a set of tabs, tables and dialogs that plain DOM components handle directly without framework churn.
- **Libraries:** ExcelJS reads `.xlsx` workbooks and writes styled workbooks (fills, fonts, column widths, frozen panes, auto-filters and A4 landscape print setup) in the browser; `fflate` packs the per-team Excel files into one `.zip` download cleanly and fast. All dependencies are pinned and bundled locally with no CDN requests.
- **Repository layout:** Keeping `web/` in the same repository lets one pull request update rules, docs and the shared parity fixtures together.
- **Supported browsers:** Current evergreen desktop and mobile browsers (Chromium-based Edge and Chrome, Firefox, Safari on macOS and iPadOS/iOS).

**Cost:** Two implementations of the engine exist while the desktop app and web app run side by side during the pilot (mitigated by the automated parity suite).

## 13. Enforced client-side privacy baseline for the web app

**Decision:** The web app enforces "your data never leaves your computer" technically as well as in guidance:
- A strict Content Security Policy (`default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'`) is set in the HTML head so the browser blocks any outgoing `fetch`, `XMLHttpRequest`, WebSocket or beacon call after the page loads.
- All scripts, stylesheets and icons are bundled with the site itself; no third-party CDNs, fonts, analytics, cookies or trackers are used.
- `localStorage` holds only user settings (`team_map`, `fuzzy`, `medical`, `team`); player data is held only in memory for the current tab session and never written to web storage.
- Automated tests verify the CSP and fail if the app attempts any network request or writes player data to storage.

**Why:** Hosting the page on GitHub Pages must not make the host or club a new processor of children's personal and medical data. Technical enforcement makes that guarantee verifiable.

