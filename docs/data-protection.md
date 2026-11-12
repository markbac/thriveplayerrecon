# Data protection

The tool handles personal data about children, including contact details and medical information. This page explains how the tool is designed around that and what users should do. It is practical guidance, not legal advice. Your club's data protection lead or welfare officer should confirm your own arrangements.

## What data is involved

| Source | Data |
| --- | --- |
| FA report | Names, dates of birth, FAN ID, team, registration status, emails, parent or carer, emergency contact, consent |
| Thrive export | Names, dates of birth, teams, mandates, account owner, phone, parent or guardian details, medical details, consents |

The FA report itself carries a warning that copies must be destroyed when no longer needed and used only to administer matches.

## How the tool limits risk

| Measure | Detail |
| --- | --- |
| Local only | All processing happens on the user's computer (in the desktop app or inside the visitor's browser in the web app). Neither version uploads files, makes network connections with player data, or sends telemetry |
| Web hosting does not create a processor | Hosting the static web app (for example on GitHub Pages) serves only the application code. The FA report, Thrive export and managers file are read, compared and exported locally in the browser and never leave the user's device, so hosting does not make the host or club a processor of uploaded player data |
| Nothing stored between runs | Players are held in memory while the app or browser tab is open. The desktop settings file (`%APPDATA%\PlayerReconcile\config.json`) and web settings (`localStorage`) contain team mappings and preferences only, never player data. The only exception is opt-in: ticking **Remember managers list on this device** keeps a copy of the managers file (adult staff names, roles, teams and contact details, no player data) in `localStorage` until it is unticked |
| No change to source systems | The tool only reads the exports |
| Warning banner | A data protection notice is shown across the top of the app at all times, with a link to this guidance |
| Warning on every export | A UK GDPR warning appears each time any export button is clicked. Clicking Cancel creates nothing |
| Medical details optional | A checkbox leaves them out of team sheets and exports. The warning names medical information when it is included |
| Least data to each manager | The sharing button writes one file per team, so a manager does not receive other teams' data |
| Marked confidential | Every exported team sheet carries a confidentiality line. The printable matchday sheet also has it in the page footer, with a note to keep it out of sight and destroy it when details change |
| Consents shown | Players without photography consent are flagged on the Missing consents list, the matchday sheet and the squad message, so they are not photographed by mistake |
| Repository safeguard | `.gitignore` excludes `.xlsx` files so exports are not committed by accident |

## Web app privacy and security checklist

The web version enforces "your data never leaves your computer" by design and verifies it automatically in tests:

- [x] **No third-party CDNs:** all scripts, stylesheets and icons are served from the site itself (or local zip folder)
- [x] **Strict Content Security Policy (CSP):** `connect-src 'none'`, `form-action 'none'`, `object-src 'none'`, `base-uri 'self'`, and no inline script injection
- [x] **Zero telemetry:** no analytics, cookies, beacons or external trackers
- [x] **Settings-only storage:** `localStorage` stores only `team_map`, `fuzzy`, `medical` and `team`; player records are never written to `localStorage`, `sessionStorage` or `IndexedDB`
- [x] **Opt-in managers file copy:** only when the user ticks **Remember managers list on this device** is the managers file (staff data, never player data) kept under `PlayerReconcile.managersFile.v1`, capped at 512 KB; unticking deletes it, and it is off by default
- [x] **Automated verification:** the test suite checks the CSP policy, asserts that no network request is made during file loading, reconciliation or export, and checks that `localStorage` never contains player names or FAN IDs

## WhatsApp and the managers file

Pasting into WhatsApp copies personal data onto every device in the chat and into backups, outside the club's control. The tool therefore warns before showing the text, adds a data protection footnote to every message, and keeps medical details in a separate message. Send it only to the manager and assistant who need it, never to a large group, and ask them to delete it afterwards. The managers file holds adults' names and optionally phone numbers and emails: keep it secure like the other files. It is never committed to the repository.

**Send to <Manager> on WhatsApp** (web and desktop apps) builds a `https://wa.me/<number>?text=<message>` link. Following it is the user's own action and is the same as pasting the message into WhatsApp, except that the message text is carried in the link: it passes through WhatsApp's `wa.me` redirect and can stay in the browser's history. The app itself still makes no network requests (`connect-src 'none'`). Use the button only for the intended manager, and clear browser history on shared computers.

**Remember managers list on this device** keeps the managers file (adults' names, roles, teams, phone numbers and emails) in the browser until it is unticked. It is off by default; do not use it on shared computers.

## What users should do

1. Download the exports only when needed and delete them when finished
1. Keep the exports and any files you create on a protected device, not on shared or public computers
1. Send each manager only their own team's file, by a secure route
1. Tell managers to keep the file secure and delete it when the season or need ends
1. Untick **Include medical details** unless the manager needs them
1. Treat a printed matchday sheet like the file: keep it with the team kit out of sight, do not leave it at the ground, and shred it when the squad or details change
1. Report any loss or unauthorised sharing as your club's policy and the FA require

## For developers

- Never commit real exports, screenshots of real data, or output files
- Use invented data in any examples, tests and bug reports
- Do not add logging that writes player details
- Do not add network calls without a documented decision in [decisions](architecture/decisions.md)
