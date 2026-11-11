# User guide

This guide is for the club administrator. The same help is built into the app: press **F1**.

## Before you start

Download two Excel files and leave them in your Downloads folder:

1. The **FA report**: the *Club - Player Report* from the FA player registration system
1. The **Thrive export**: the player data export from Thrive

The tool only reads these files. It never changes anything in the FA system or Thrive. The same steps are in the app under **Help > Getting the exports**, or click the **How to get these files** link in the Step 1 heading.

### Getting the FA report

1. Go to the club portal: <https://clubs.thefa.com/>
1. Select **Players**, then **Export > Player information**
1. Wait for the export to be created, then go to **My club > Documents** and download it. It can take a few minutes to appear

### Getting the Thrive export

1. Log in to Thrive and go to **Contacts**
1. Select the products you are interested in
1. Open **Manage table columns** and make sure all of these are added:
   - Name
   - Date of birth
   - Teams
   - Active pre-authorisation
   - Account owner
   - Owner phone
   - Parents/guardian name, required for fa registration
   - Parents/guardian email address for fa registration
   - Parents/guardian date of birth required for fa registration
   - Medical
   - Medical notes
   - Wwfc photography policy
   - Wwfc code of conduct - youth players
   - Club rules
1. Click **Export**

Some items, such as **Medical**, add several columns to the export.

**Name**, **Date of birth** and **Teams** are essential: without them the tool stops and says which to add. If anything else is missing, the comparison still runs and a message lists the missing items and what they are used for:

| Missing item | Effect |
| --- | --- |
| Active pre-authorisation | The tool cannot tell who is paying. The Paying column shows Unknown, and Not paying lists only players not found in Thrive |
| Account owner, Owner phone, Parents/guardian items | Contact details are blank on team sheets and in messages |
| Medical, Medical notes | Medical information is blank |
| Photography policy, code of conduct, Club rules | Consents are blank |

## Step 1: choose your files

Click **Find my latest exports**. The tool looks in your Downloads folder for the newest FA report and Thrive export and fills in both boxes. Or use **Browse** for each.

If you put the files in the wrong boxes, the tool notices and swaps them.

## Step 2: reconcile

Click **Reconcile** (or press **Ctrl+R**). It takes a few seconds. A message tells you how many players were compared and whether any Thrive team needs a decision.

## Reading the results

The **Results** tab has a list of views on the left. The selected view is highlighted, and its name, a one-line explanation and the number of players are shown above the table.

| View | What it shows |
| --- | --- |
| All players | Everyone from both systems |
| Needs attention | Anything someone should look at |
| In Thrive, not in FA | Players in Thrive but not found in the FA report |
| In FA, not in Thrive | Players registered with the FA but not found in Thrive |
| Check match | Probably the same person, but the name or date of birth differs |
| Team differs | Same player, different team in the two systems |
| Data quality | Likely data entry problems |

Row colours: green is fine, yellow needs a look, red needs action, grey is for information only.

Useful things to know:

- **Double-click a row** to see every detail in a readable window
- **Click a column heading** to sort
- **Search** narrows the list to rows containing what you type
- **Name fuzziness** controls how tolerant the name matching is. Lower accepts more typos but may suggest wrong matches. The default is 0.80

### What the results mean

| Result | Meaning | What to do |
| --- | --- | --- |
| Matched | Same name and date of birth, teams agree | Nothing |
| Matched (team differs) | Same player, teams do not agree | Fix the team in Thrive or the FA system |
| Matched (data quality) | Same player, but something in the data looks wrong | See the Data quality column |
| Check match | Probably the same person but details differ | Confirm, then correct the wrong system |
| Thrive only | Not found in the FA report | Register them with the FA, or correct their name or date of birth |
| FA only | Registered with the FA, not found in Thrive | Add them to Thrive, or correct their details |
| Thrive only (expected) | In a team with no FA equivalent, such as U4, U5, U6 or a training group. FA registration is not needed | Check they have an active mandate (they appear on Not paying if not) |
| FA only (not registered) | FA status is Cancelled or Transferred | Nothing |

### Data quality flags

| Flag | Likely cause |
| --- | --- |
| Thrive date of birth gives an adult age | A parent's date of birth was entered instead of the child's |
| Thrive name matches an FA parent or carer | The parent's record was created as a player |
| Too old for the team | Wrong date of birth, or wrong team |
| Capitalisation | Name typed in lower case or capitals |
| Possible duplicate | The same player entered twice |
| Suspended | The FA report shows the player is suspended |

## Team sheets

The **Team sheets** tab is for team managers. Pick a team, or step through teams with the arrow buttons either side of the team box (or **Alt+Left** and **Alt+Right**).

The list shows the key facts for each player: name, whether they pay through Thrive, age, where registered, FA status, main contact, whether medical information is recorded, consents and any note.

- Players **not paying** (no active mandate, or not found in Thrive) have a **red row in bold** and are marked **✖ NOT PAYING**. The red replaces the registration colour; the In column still says where they are registered. The number not paying is shown in red above the list. Tick **Show only not paying** to list just them
- Players with medical information are shown in red with a warning sign
- **Consents** shows a tick, or which consents are missing (Photography, Code of conduct, Club rules)

- **Search** finds a player by any detail, including phone numbers, emails and medical conditions
- Click a column heading to sort, and click again to reverse
- Double-click a player, or select one and press **Enter**, to see everything, grouped into sections:
  - Contacts from both systems: Thrive account owner and phone, Thrive parent or guardian, FA parent or carer, player email, emergency contact
  - Medical information from Thrive
  - Photography, code of conduct, club rules and FA consent, and which are missing

The team Excel files keep every column, including **Paying through Thrive** and **Consents missing**.

Each player is coloured by where they are registered for that team:

| Colour | Meaning |
| --- | --- |
| Green | In both the FA system and Thrive |
| Orange | FA only |
| Blue | Thrive only |
| Grey | No FA needed: a Thrive group with no FA team, such as U4 to U6 or training. Only the mandate is checked |

## Not paying

The **Not paying** tab lists players with no active Thrive mandate, plus players registered with the FA but not found in Thrive. These are the players who will not be paying through Thrive.

> **Note:** a player listed as not found in Thrive may be there under a different name. Check before you chase.

Use **Search** and the column headings to narrow and sort the list. **Copy for WhatsApp** makes a message listing each player's name and team, whether they are in the FA system and in Thrive, and whether they have an active mandate. Choose **All teams**, or one team to send to that team's manager.

## Missing consents

The **Missing consents** tab lists players in Thrive who have not given a consent: **Photography**, **Code of conduct** or **Club rules**. A blank answer, No, declined or anything similar counts as not given. The answer itself is shown so you can check it.

Players without photography consent are listed first. Their manager must not photograph them; the team's WhatsApp squad message and matchday sheet both say so.

A consent is only checked if the Thrive export includes it. If one is not in the export, a red note at the top says which: add it in Thrive under **Contacts > Manage table columns** and export again.

Use **Search** and the column headings to narrow and sort, and **Export this list** to save it. The full workbook also has a **Missing consents** sheet.

## Matchday sheet

Every team file (from **Export team files for managers** or **Export this team**) opens on a **Matchday sheet**, ready to print on A4 landscape, one page wide. It has:

- blank lines for the date, opponent, venue and kick-off, and the team's managers
- a **Here** column to tick who turned up
- each player's parent contact and phone, and the emergency contact and phone
- **Medical alert**, highlighted in red, listing conditions, allergies and medicines
- **Photos OK**: **NO**, highlighted, for players without photography consent

The full player details are on the second sheet. Untick **Include medical details** to leave the medical alerts off. Ask managers to keep the sheet out of sight with the team kit and destroy it when the squad or details change.

## Step 3: share

| Button | What it does |
| --- | --- |
| Export team files for managers | Saves one Excel file per team into a dated folder, ready to send. Each file opens on the printable matchday sheet. Each manager should receive only their own team's file |
| Export full workbook | One Excel file with every view, the not paying and missing consents lists, and a sheet for each team |
| Export this team (Team sheets tab) | Saves the team on screen, with its matchday sheet |
| Copy for WhatsApp (Team sheets tab) | Text to paste into WhatsApp, see below |
| Export this list (Not paying or Missing consents tab) | Saves that list |

Untick **Include medical details** to leave medical information out of team sheets and exports.

A data protection warning appears every time you click an export button. Read it, then click **OK** to continue or **Cancel** to stop. Nothing is created if you cancel. A reminder banner also stays at the top of the app.

> **Warning:** the files contain children's personal details. Only send a team's file to that team's manager, keep files secure and delete them when finished. See [data protection](data-protection.md).

## Copy for WhatsApp

Managers do not use this tool, so you can send them text instead of a file. On the **Team sheets** tab, choose a team and click **Copy for WhatsApp**. A warning appears first. Then a window shows:

- a **Squad** message: each player's age, whether they are in the FA and Thrive, whether they have a direct debit mandate, the parent or carer contact and emergency contact, and a clear warning for anyone without photography consent (plus any other missing consent)
- a separate **Medical** message listing only players with medical information recorded (not shown if **Include medical details** is unticked)

Each message ends with a data protection footnote. Long teams are split into parts, shown as tabs. You can edit the text, click **Copy to clipboard**, then paste into WhatsApp.

> **Warning:** send these only to the manager and assistant who need them, never to a large group. Ask them not to forward the messages and to delete them when finished. WhatsApp keeps copies on every device in the chat.

## Managers file (optional)

To show manager and assistant manager names on team sheets, Excel files and messages, choose a **Managers file** in Step 1. Click **Managers template** (or **File > Save a managers file template**) for an example. Two layouts work, found from the column headings:

| Layout | Columns |
| --- | --- |
| One row per person | Name, Role (Manager or Assistant manager), Team(s), and optionally Phone and Email |
| One row per team | Team, Manager, Assistant manager |

If the file has phone numbers, **Copy manager phone** and **Copy assistant phone** on the Team sheets tab put the number on the clipboard. Paste it into WhatsApp to find their chat, then use **Copy for WhatsApp** to send the team details. Several teams or names in one cell can be separated by commas. Team names are matched to the FA and Thrive teams (for example `U12 Black`). Anything that does not match, and any team with no manager, is listed in the Summary sheet of the full workbook.

## Team mappings

Thrive and the FA name teams differently, for example *U07 Eagles* and *Wilpshire Wanderers U7 Eagles*. The **Team mappings** tab says which matches which.

- The defaults match the club's current teams
- Each time you reconcile, new Thrive teams get a suggested FA team
- Rows in **red** need a decision. Click the row, choose the FA team, click **Apply**
- Choose **(ignore)** for Thrive groups with no FA team, such as training squads
- Changes save automatically and update the results straight away
- **Reset to defaults** restores the built-in mapping

## Troubleshooting

| Problem | What to do |
| --- | --- |
| The file does not look like the expected report | Check you chose the right files. The tool can swap them if they are the wrong way round |
| The Thrive export "is missing: Name, Teams" (or similar) | Add those items in Thrive under **Contacts > Manage table columns** and export again. See [Getting the Thrive export](#getting-the-thrive-export) |
| A message lists missing Thrive items after reconciling | The comparison still ran, but those details are blank. Add the items in Manage table columns and export again |
| Paying shows **? Unknown** for everyone | The Thrive export has no mandate column. Add **Active pre-authorisation** and export again |
| Could not save | The Excel file is open. Close it and try again |
| A player shows in both lists but is the same person | Their name or date of birth is too different. Correct it in one system and reconcile again, or lower the Name fuzziness a little |
| A medical column is blank | The Thrive export did not include that field. Add **Medical** and **Medical notes** in Manage table columns |
| Windows warns about the exe | It is not code signed. Choose **More info**, then **Run anyway**. Compare the file with `SHA256SUMS.txt` from the release if you want to check it |


## Using the web app

The web app provides the same tabs, matching rules and exports inside your browser on Windows, Mac, Chromebook and tablet:

- **Choosing files:** drag and drop the FA report and Thrive export onto the Step 1 boxes, or click **Browse...** (browsers do not allow a web page to scan your Downloads folder automatically, so **Find my latest exports** is desktop-only)
- **Team files download:** clicking **Export team files for managers** downloads a single `.zip` archive (`Team_files_YYYY-MM-DD.zip`) containing one Excel file per team inside a dated folder
- **Settings backup:** your team mappings and preferences are saved in your browser's `localStorage` (never player data). On the **Team mappings** tab, use **Export settings...** and **Import settings...** to move your mappings to another computer or save a backup before clearing browser data
