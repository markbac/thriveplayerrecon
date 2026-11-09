# Runtime flow

## Reconcile and share

This is what happens when the administrator clicks **Reconcile** and then shares team files.

```mermaid
sequenceDiagram
  actor Admin as Administrator
  participant GUI as Desktop GUI
  participant Core as Reconciliation engine
  participant Files as Excel files

  Admin->>GUI: Choose the FA report and Thrive export
  Admin->>GUI: Click Reconcile
  GUI->>Core: detect_kind for each file
  Core-->>GUI: fa or thrive
  Note over GUI: If the boxes are the wrong way round, swap them and tell the user
  GUI->>Core: load_fa and load_thrive
  Core->>Files: Read both workbooks
  Files-->>Core: Rows
  Core-->>GUI: FA players and Thrive players
  GUI->>Core: suggest_mapping for any new Thrive team
  GUI->>Core: reconcile with players, team mapping and fuzziness
  Core->>Core: Pair players, compare teams, run data quality checks, build team membership
  Core-->>GUI: Result with rows and teams
  GUI-->>Admin: Results views, team sheets and not paying list
  Admin->>GUI: Click Export team files for managers
  GUI-->>Admin: Remind that medical details are included
  GUI->>Core: export_each_team
  Core->>Files: Write one workbook per team
  GUI-->>Admin: Offer to open the folder
```

## Changing a setting

Changing a team mapping or the name fuzziness does not reload the files. The GUI keeps the loaded players and calls `reconcile` again, then refreshes every view.

```mermaid
flowchart LR
  change["Mapping or fuzziness changed"] --> save["Save settings"]
  save --> recompute["reconcile on the loaded players"]
  recompute --> views["Refresh results, team sheets, not paying and mappings"]
```

## Error handling

| Situation | Behaviour |
| --- | --- |
| A file is not the expected report | The engine raises `ReportError` naming the file and the columns expected. The GUI shows it in plain English |
| Files in the wrong boxes | Detected from the headings and swapped automatically |
| The output file is open in Excel | The save fails with a message asking the user to close it and try again |
| A Thrive team is not in the mapping | Shown in red on the Team mappings tab and flagged on affected players. Never silently ignored |
| An optional column is missing | The field is left blank and everything else still works |
