# Architecture

Thrive Player Recon is a single-user Windows desktop tool. It reads two Excel exports, compares them, and writes Excel files. It has no server, no database and no network access.

## Contents

| Document | What it shows |
| --- | --- |
| [C4 context](c4-context.md) | The tool, the people who use it and the systems the data comes from |
| [C4 containers](c4-container.md) | The deployable parts and the files they read and write |
| [C4 components](c4-component.md) | The building blocks inside the reconciliation engine and the GUI |
| [Deployment and pipeline](c4-deployment.md) | Where the tool runs and how the exe is built and released |
| [Runtime flow](runtime-reconcile.md) | What happens from clicking Reconcile to exporting team files |
| [Data model](data-model.md) | The records and result objects |
| [Matching algorithm](matching-algorithm.md) | Scoring, pairing and the data quality rules |
| [Decisions](decisions.md) | The reasons behind the main design choices |

## Purpose and scope

The club keeps player records in two places. The FA player registration system is the official register. Thrive holds membership, payments and the details managers need. They drift apart through typos, nicknames, wrong dates of birth and missed registrations.

The tool:

1. Matches players across the two exports
1. Reports every difference and likely data entry error
1. Produces per-team sheets for managers and a list of players who are not paying

It does not change data in either system. Corrections are made by a person in the source system.

## Quality attributes

| Attribute | How the design supports it |
| --- | --- |
| Usable by non-technical volunteers | Single exe, guided three-step workflow, plain-English results, help, tooltips, finds the latest exports and corrects swapped files |
| Privacy | All processing is local. No network calls, no telemetry. Settings hold file paths and team mappings only. Medical details can be left out. One file per team limits what each manager receives |
| Trustworthy results | Only an exact name and date of birth counts as matched. Every difference is shown with both values so a person confirms it |
| Maintainable | The engine has no GUI code. A single module holds each concern. Version is defined once |
| Portable | Standard library plus openpyxl. Builds to one exe with no installer |

## Constraints

- The users are volunteers on ordinary Windows PCs, so no installer, runtime or admin rights can be assumed
- Thrive has no FAN ID, so players must be matched on name and date of birth
- The export layouts belong to the FA and Thrive and can change. Columns are found by heading to tolerate this
- The data is about children and includes medical details, which sets the privacy approach

## Known limitations

- There are no manual match overrides yet. A "Check match" row can only be cleared by correcting the source system
- Two different players with the same name and date of birth cannot be told apart
- The exe is not code signed, so Windows SmartScreen may warn on first run
- The tool reads a snapshot. Results are only as current as the exports
- There are no unit tests yet. The pipeline runs a start-up self-test of the built exe only

## Glossary

| Term | Meaning |
| --- | --- |
| FAN ID | The FA's unique number for a person. Present in the FA report, absent in Thrive |
| FA team | A team name as registered with the FA, for example *Wilpshire Wanderers U12 Black* |
| Thrive team | A team name as written in Thrive, for example *U12 Black*. A player may have several, including training groups |
| Mandate | A Thrive payment authorisation. No active mandate means the player is not paying through Thrive |
| Mapping | The rule that says which Thrive team matches which FA team, or that a Thrive team is ignored |
| Both, FA only, Thrive only | Where a player is registered for a given team |
| Football age | Age on 31 August before the season starts, used to check a player is not too old for a team |
