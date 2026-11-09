# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Tables: columns now fit their contents, and columns that are empty for a team are hidden on the Team sheets tab
- Clear "nothing compared yet" notice on each results tab and a status under the Reconcile button until you reconcile
- Progress bar while reconciling, with the current step shown in the status bar

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
