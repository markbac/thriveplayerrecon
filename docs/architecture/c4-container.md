# C4 level 2: containers

The tool ships as one executable, but it is built from three parts with clear responsibilities, plus the files it reads and writes.

```mermaid
C4Container
  title Containers for Thrive Player Recon

  Person(admin, "Club administrator", "Runs the tool")

  System_Boundary(app, "Thrive Player Recon - one Windows exe") {
    Container(gui, "Desktop GUI", "Python, tkinter", "File selection, results views, team sheets, team mappings, help, export buttons")
    Container(engine, "Reconciliation engine", "Python module reconcile_core", "Reads exports, matches players, checks data quality, builds reports and WhatsApp text and writes Excel")
    ContainerDb(settings, "Settings file", "JSON in the user profile", "Last file paths (including the managers file), team mappings, name fuzziness, medical option")
  }

  ContainerDb_Ext(fafile, "FA player report", "Excel file", "Club - Player Report, one row per player and team")
  ContainerDb_Ext(thrivefile, "Thrive data export", "Excel file", "One row per player with contacts, medical details and consents")
  ContainerDb_Ext(stafffile, "Managers file", "Excel or CSV file, optional", "Managers, assistant managers and their teams")
  ContainerDb_Ext(outputs, "Excel outputs", "Excel files", "Full workbook, one file per team, not paying list")

  Rel(admin, gui, "Uses")
  Rel(gui, engine, "Calls", "Python function calls")
  Rel(gui, settings, "Reads and writes", "JSON")
  Rel(engine, fafile, "Reads", "openpyxl")
  Rel(engine, thrivefile, "Reads", "openpyxl")
  Rel(engine, stafffile, "Reads", "openpyxl or csv")
  Rel(engine, outputs, "Writes", "openpyxl")
  Rel(gui, admin, "Shows WhatsApp text to copy")
```

## Responsibilities

| Container | Responsibility | Source |
| --- | --- | --- |
| Desktop GUI | Everything the user sees and clicks. Holds the current session state and calls the engine. Contains no matching or reporting logic | `src/app.py` |
| Reconciliation engine | All logic that does not need a screen: reading, matching, data quality, team membership, reports and Excel output | `src/reconcile_core.py` |
| Settings file | Small JSON file at `%APPDATA%\PlayerReconcile\config.json`. Contains no player data | written by `src/app.py` |

## Why the split matters

The engine imports no GUI code, so it can be run and tested without a display and reused by a command line or other front end later. See [decisions](decisions.md).
