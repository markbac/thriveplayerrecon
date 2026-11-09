# User guide

This guide is for the club administrator. The same help is built into the app: press **F1**.

## Before you start

Download two Excel files and leave them in your Downloads folder:

1. The **FA report**: the *Club - Player Report* from the FA player registration system
1. The **Thrive export**: the player data export from Thrive. Include the contact, medical and consent fields if you want them on the team sheets

The tool only reads these files. It never changes anything in the FA system or Thrive.

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

The list shows the key facts for each player: name, age, where registered, FA status, whether they pay through Thrive, main contact, whether medical information is recorded and any note. Players with medical information are shown in red with a warning sign.

- **Search** finds a player by any detail, including phone numbers, emails and medical conditions
- Click a column heading to sort, and click again to reverse
- Double-click a player, or select one and press **Enter**, to see everything, grouped into sections:
  - Contacts from both systems: Thrive account owner and phone, Thrive parent or guardian, FA parent or carer, player email, emergency contact
  - Medical information from Thrive
  - Photography, code of conduct and FA consent

The team Excel files keep every column, including **Paying through Thrive**.

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

## Step 3: share

| Button | What it does |
| --- | --- |
| Export team files for managers | Saves one Excel file per team into a dated folder, ready to send. Each manager should receive only their own team's file |
| Export full workbook | One Excel file with every view, the not paying list and a sheet for each team |
| Export this team (Team sheets tab) | Saves the team on screen |
| Copy for WhatsApp (Team sheets tab) | Text to paste into WhatsApp, see below |
| Export this list (Not paying tab) | Saves the not paying list |

Untick **Include medical details** to leave medical information out of team sheets and exports.

A data protection warning appears every time you click an export button. Read it, then click **OK** to continue or **Cancel** to stop. Nothing is created if you cancel. A reminder banner also stays at the top of the app.

> **Warning:** the files contain children's personal details. Only send a team's file to that team's manager, keep files secure and delete them when finished. See [data protection](data-protection.md).

## Copy for WhatsApp

Managers do not use this tool, so you can send them text instead of a file. On the **Team sheets** tab, choose a team and click **Copy for WhatsApp**. A warning appears first. Then a window shows:

- a **Squad** message: each player's age, whether they are in the FA and Thrive, whether they have a direct debit mandate, and the parent or carer contact and emergency contact
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
| Could not save | The Excel file is open. Close it and try again |
| A player shows in both lists but is the same person | Their name or date of birth is too different. Correct it in one system and reconcile again, or lower the Name fuzziness a little |
| A medical column is blank | The Thrive export did not include that field |
| Windows warns about the exe | It is not code signed. Choose **More info**, then **Run anyway**. Compare the file with `SHA256SUMS.txt` from the release if you want to check it |
