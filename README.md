# Thrive Player Recon

[![Build and release](https://github.com/markbac/thriveplayerrecon/actions/workflows/build-release.yml/badge.svg)](https://github.com/markbac/thriveplayerrecon/actions/workflows/build-release.yml)
[![Deploy web app](https://github.com/markbac/thriveplayerrecon/actions/workflows/deploy-web.yml/badge.svg)](https://github.com/markbac/thriveplayerrecon/actions/workflows/deploy-web.yml)

A tool for grassroots football clubs, available as both a **client-side web app** (works in any browser on Windows, Mac, Chromebook and tablet) and a **Windows desktop exe**. It reconciles the **FA player registration report** with the **Thrive data export**, flags data quality problems, and produces a sheet for each team manager.

Both versions work entirely on your own computer. In the web app, your files are read, compared and exported in your browser in JavaScript and are **never uploaded** anywhere.

## What it does

- Matches players between the two systems by name and date of birth, with fuzzy name matching (nicknames, typos, double-barrelled names, swapped first and last names)
- Shows who is in Thrive but not the FA, in the FA but not Thrive, and who needs a closer look
- Flags data quality problems such as an adult's date of birth entered for a child, a parent's name used as the player, a player too old for their team, and duplicates
- Maps Thrive teams to FA teams, with defaults built from the club's own files and a screen to change them
- Builds **team sheets** for managers: players, contacts, medical information and consents, coloured by whether each player is in the FA, Thrive or both
- Lists players who will not be paying (no active Thrive mandate, or not in Thrive)
- Lists players **missing a consent** (photography, code of conduct, club rules), photography first
- Makes **WhatsApp-ready text** for each team (squad, contacts, sign-up and direct debit status, plus a separate medical message) for you to copy and paste, because managers do not have the tool
- Optionally reads a **managers file** (managers, assistants and their teams) to show who looks after each team
- Exports everything to Excel: one full workbook, or one file per team ready to send to managers (as a `.zip` in the web app, or a dated folder in the desktop app). Each team file opens on a printable **matchday sheet** with contacts, emergency contacts, medical alerts and photo consent
- Keeps data protection in view: a permanent UK GDPR banner in the app, a strict Content Security Policy (`connect-src 'none'`) in the web app, and a warning every time you export

## Using the web app

Open the hosted web app (on GitHub Pages) or download the offline web `.zip` bundle from the workflow artifacts / release to run locally without internet access:

1. **Choose or drag-and-drop your two files** in Step 1: the FA registration report and the Thrive data export (plus an optional managers file)
1. Click **Reconcile**
1. On the **Results** tab, pick a view on the left. Click any row for the full details
1. Use **Share** (Step 3) to download the team files `.zip` for managers, or the full workbook

## Download and run the Windows desktop app

You do not need Python.

1. Open the [latest release](https://github.com/markbac/thriveplayerrecon/releases/latest)
1. Download `PlayerReconcile-<version>.exe`
1. Double-click it

> **Note:** the exe is not code signed, so Windows SmartScreen may warn you the first time. Click **More info**, then **Run anyway**. Each release includes `SHA256SUMS.txt` so you can check the download.

## Using the tool

1. **Choose your files.** In the desktop app, click **Find my latest exports** to pick up the newest FA report and Thrive export from your Downloads folder, or use **Browse** (or drag and drop in the web app)
1. Click **Reconcile**
1. On the **Results** tab, pick a view on the left. Click or double-click any row for the full details
1. Use **Share** to export team files for managers, or the full workbook

Press **F1** in the app for built-in help. The full guide is in [docs/user-guide.md](docs/user-guide.md).

### The tabs

| Tab | Purpose |
| --- | --- |
| Results | Every player and the outcome of the comparison, with views for each kind of problem |
| Team sheets | One team at a time for managers, with contacts, medical information and consents |
| Not paying | Players with no active mandate, or not found in Thrive |
| Missing consents | Players who have not given photography, code of conduct or club rules consent |
| Team mappings | Which Thrive team matches which FA team (with settings export and import in the web app) |

## Getting the two files

- **FA report:** in the club portal (<https://clubs.thefa.com/>) select **Players**, then **Export > Player information**. When it has been created (it can take a few minutes), download it from **My club > Documents**
- **Thrive export:** in Thrive go to **Contacts**, select the products you want, add the needed items in **Manage table columns**, then click **Export**

The full steps and the list of Thrive items are in the [user guide](docs/user-guide.md#getting-the-thrive-export) and in the app under **Help > Getting the exports**.

The tool finds columns by their headings, so extra columns do no harm. If Name, Date of birth or Teams is missing it says which to add. Anything else missing is listed after the comparison runs, with what it is used for; without the mandate column, paying shows as Unknown rather than everyone appearing unpaid.

## Documentation

| Document | Contents |
| --- | --- |
| [User guide](docs/user-guide.md) | Step-by-step use, what each result means, troubleshooting |
| [Architecture](docs/architecture/README.md) | Overview, quality attributes, constraints |
| [C4 context](docs/architecture/c4-context.md) | The tool and the people and systems around it |
| [C4 containers](docs/architecture/c4-container.md) | The parts that make up the tool |
| [C4 components](docs/architecture/c4-component.md) | Inside the reconciliation engine and the GUI |
| [Deployment and pipeline](docs/architecture/c4-deployment.md) | How the exe and web app are built and released |
| [Runtime flow](docs/architecture/runtime-reconcile.md) | What happens when you click Reconcile |
| [Data model](docs/architecture/data-model.md) | The records the tool works with |
| [Matching algorithm](docs/architecture/matching-algorithm.md) | How players are paired and scored |
| [Decisions](docs/architecture/decisions.md) | Why the tool is built the way it is |
| [Data protection](docs/data-protection.md) | Handling children's personal and medical data |
| [Development](docs/development.md) | Running from source, building, releasing |
| [Changelog](CHANGELOG.md) | What changed in each version |

## Run from source

### Desktop app (Python + tkinter)

Requires Python 3.9 or later on Windows. Python from python.org includes the tkinter library the GUI needs.

```bash
py -m pip install -r requirements.txt
py src/app.py
```

### Web app (TypeScript + Vite)

Requires Node.js 20 or later.

```bash
cd web
npm install
npm run dev
```

To run the cross-engine parity and privacy test suite:

```bash
cd web
npm test
```

## Build the exe locally

Double-click `scripts/build_exe.bat`, or run it from a terminal. The exe is written to `dist` and the folder opens when it finishes.

## Releases

Releases are built and published by GitHub Actions when a version tag is pushed, and the web app is deployed to GitHub Pages on merge to `main`. The steps are in [docs/development.md](docs/development.md). The version is kept in sync between `src/version.py` and `web/package.json`.

## Project layout

```text
src/                     the desktop application (Python)
  app.py                 GUI (tkinter), menus, help, exports
  reconcile_core.py      matching, data quality, reports, Excel export (no GUI code)
  version.py             app name and version
  assets/                club crest and icon
web/                     the client-side web application (TypeScript + Vite)
  src/reconcile_core.ts  browser port of the reconciliation engine
  src/excel_io.ts        browser Excel/CSV reading and styled Excel/Zip writing
  src/app_ui.ts          accessible web UI, tabs, modals and settings
  tests/                 Vitest parity and privacy test suite
tests/                   Python pytest suite and shared parity snapshot (tests/parity/)
docs/                    guides and architecture
scripts/                 local build and parity fixture scripts
.github/workflows/       build, release and GitHub Pages pipelines
```

## Data protection

> **Important:** the exports contain children's names, dates of birth, contact details and medical information. Never commit them to this repository. `.gitignore` excludes `.xlsx` files as a safeguard. Keep exports and team files secure, share each team's file only with that team's manager, and delete files when they are no longer needed. See [docs/data-protection.md](docs/data-protection.md).

## Licence

[MIT](LICENSE)
