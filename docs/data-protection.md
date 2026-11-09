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
| Local only | All processing happens on the user's computer. The tool makes no network connections and sends no telemetry |
| Nothing stored between runs | Players are held in memory while the app is open. The settings file contains file paths, team mappings and options only |
| No change to source systems | The tool only reads the exports |
| Warning banner | A data protection notice is shown across the top of the app at all times, with a link to this guidance |
| Warning on every export | A UK GDPR warning appears each time any export button is clicked. Clicking Cancel creates nothing |
| Medical details optional | A checkbox leaves them out of team sheets and exports. The warning names medical information when it is included |
| Least data to each manager | The sharing button writes one file per team, so a manager does not receive other teams' data |
| Marked confidential | Every exported team sheet carries a confidentiality line |
| Repository safeguard | `.gitignore` excludes `.xlsx` files so exports are not committed by accident |

## WhatsApp and the managers file

Pasting into WhatsApp copies personal data onto every device in the chat and into backups, outside the club's control. The tool therefore warns before showing the text, adds a data protection footnote to every message, and keeps medical details in a separate message. Send it only to the manager and assistant who need it, never to a large group, and ask them to delete it afterwards. The managers file holds adults' names and optionally phone numbers and emails: keep it secure like the other files. It is never committed to the repository.

## What users should do

1. Download the exports only when needed and delete them when finished
1. Keep the exports and any files you create on a protected device, not on shared or public computers
1. Send each manager only their own team's file, by a secure route
1. Tell managers to keep the file secure and delete it when the season or need ends
1. Untick **Include medical details** unless the manager needs them
1. Report any loss or unauthorised sharing as your club's policy and the FA require

## For developers

- Never commit real exports, screenshots of real data, or output files
- Use invented data in any examples, tests and bug reports
- Do not add logging that writes player details
- Do not add network calls without a documented decision in [decisions](architecture/decisions.md)
