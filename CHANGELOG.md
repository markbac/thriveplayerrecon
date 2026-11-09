# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
- Easier use: find latest exports in Downloads, wrong-way-round file detection, help, tooltips, details window for any row
- Build and release pipeline that publishes the Windows exe from a version tag
