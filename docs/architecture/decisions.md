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

**Decision:** A checkbox leaves medical information out of team sheets and exports, and the user is reminded before exporting with it.

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
