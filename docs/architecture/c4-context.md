# C4 level 1: system context

The tool sits between two systems the club already uses. The administrator downloads an export from each, loads them into the tool, and passes team files on to managers.

```mermaid
C4Context
  title System context for Thrive Player Recon

  Person(admin, "Club administrator", "Registers players and keeps the FA and Thrive records in step")
  Person_Ext(manager, "Team manager", "Needs the players, contacts and medical details for their team")

  System(tool, "Thrive Player Recon", "Windows desktop tool that reconciles the two player lists and prepares team sheets")

  System_Ext(fa, "FA player registration system", "Official register of players, source of the Club - Player Report")
  System_Ext(thrive, "Thrive", "Club membership and payments, source of the data export")

  Rel(admin, fa, "Downloads the player report from")
  Rel(admin, thrive, "Downloads the data export from")
  Rel(admin, tool, "Loads both files and reviews results in")
  Rel(tool, admin, "Shows results and writes Excel files for")
  Rel(admin, manager, "Sends the team file to")
  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

## Notes

- The tool has no live connection to the FA system or Thrive. The administrator moves data by downloading and loading files
- Corrections flow the other way by hand: the administrator fixes the wrong record in the FA system or Thrive
- Managers never use the tool. They receive an Excel file for their own team only
