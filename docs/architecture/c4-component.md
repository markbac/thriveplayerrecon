# C4 level 3: components

## Reconciliation engine

```mermaid
C4Component
  title Components of the reconciliation engine (reconcile_core.py)

  Container_Boundary(engine, "Reconciliation engine") {
    Component(loaders, "File loaders", "load_fa, load_thrive, detect_kind, find_latest_exports", "Find columns by heading, read players, recognise which file is which")
    Component(matcher, "Player matcher", "name and date of birth scoring, pair_up", "Scores every candidate pair and pairs players one to one, best score first")
    Component(staff, "Managers file", "load_staff, attach_staff, write_staff_template", "Reads managers and assistants in two layouts and matches their teams to team labels")
    Component(whatsapp, "WhatsApp text builders", "whatsapp_squad, whatsapp_medical", "Plain text messages split into parts, each with a data protection footnote")
    Component(mapping, "Team mapping", "DEFAULT_TEAM_MAP, suggest_mapping, club_prefix", "Maps Thrive teams to FA teams and suggests mappings for new teams")
    Component(quality, "Data quality checks", "age, parent and capitalisation checks", "Flags adult dates of birth, parent names, players too old for a team, duplicates")
    Component(reconciler, "Reconciler", "reconcile", "Combines the above into one result row per player and builds team membership")
    Component(reports, "Report builders", "team_report, not_paying_report, RESULT_TABS", "Shape result rows into the tables used by the GUI and Excel")
    Component(exporter, "Excel exporter", "export_xlsx, export_team_xlsx, export_each_team, export_not_paying_xlsx", "Writes workbooks with colour coding, filters and a confidentiality note")
  }

  Rel(loaders, reconciler, "Supplies FA and Thrive players to")
  Rel(reconciler, matcher, "Pairs players using")
  Rel(reconciler, mapping, "Resolves teams using")
  Rel(reconciler, quality, "Applies")
  Rel(reconciler, reports, "Provides result rows to")
  Rel(staff, reconciler, "Adds staff to the result of")
  Rel(reports, whatsapp, "Shares team membership with")
  Rel(reports, exporter, "Provides tables to")
```

| Component | Key behaviour |
| --- | --- |
| File loaders | Locate columns by exact, then starting, then containing heading text. Group FA rows by FAN ID so a player in two teams is one player. Split Thrive team lists on commas and remove duplicates |
| Player matcher | Details in [matching algorithm](matching-algorithm.md) |
| Team mapping | A Thrive team maps to an FA team, to ignore, or is unmapped. Unmapped teams are reported, never silently dropped |
| Data quality checks | Rules listed in [matching algorithm](matching-algorithm.md#data-quality-rules) |
| Reconciler | Classifies each player into a result and records, per team, whether the player is in both systems, FA only or Thrive only |
| Managers file | Tolerant loader found by column headings, with a template writer and a list of unmatched teams and teams without a manager |
| WhatsApp text builders | Build the squad and medical messages from the same team data as the sheets |
| Report builders | One function per report. Both the screen and Excel use them, so what you see is what you export |
| Excel exporter | One shared table writer, so every sheet has the same look and behaviour |

## Desktop GUI

```mermaid
C4Component
  title Components of the desktop GUI (app.py)

  Container_Boundary(gui, "Desktop GUI") {
    Component(topbar, "Workflow bar", "tkinter frames", "Step 1 choose files, step 2 reconcile, step 3 share")
    Component(results, "Results view", "sidebar and table", "Choose a view, search, sort, double-click for details")
    Component(teams, "Team sheets view", "combobox and table", "Pick a team, see contacts, medical information and consents")
    Component(notpaying, "Not paying view", "table", "Players with no mandate or not in Thrive")
    Component(mappings, "Team mappings editor", "table and form", "Review and change Thrive to FA team mappings")
    Component(helpui, "Help and hints", "menus, tooltips, help window", "Plain-English guidance throughout")
    Component(settingsio, "Settings store", "JSON file", "Remembers files, mappings and options")
  }

  Container(engine, "Reconciliation engine", "Python module", "Does the work")

  Rel(topbar, engine, "Loads files and runs reconciliation")
  Rel(results, engine, "Reads result rows from")
  Rel(teams, engine, "Reads team reports from")
  Rel(notpaying, engine, "Reads the not paying report from")
  Rel(mappings, settingsio, "Saves changes to")
  Rel(topbar, settingsio, "Remembers file locations in")
  Rel(topbar, engine, "Starts exports in")
```

The GUI keeps the loaded players and the latest result in memory. Changing a mapping or the fuzziness recomputes the result from the loaded players, so the files are not read again.
