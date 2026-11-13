/**
 * Shared texts, view descriptions, UK GDPR warnings and help sections for the web app.
 * Equivalent to the desktop help sections in src/app.py.
 */
import * as rc from './reconcile_core';

export const IGNORE_LABEL = '(ignore)';
export const UNMAPPED_LABEL = '(unmapped)';

export const VIEW_GROUPS: Array<[string, Array<[string, string]>]> = [
  [
    'Overview',
    [
      [
        'All players',
        'Every player from both systems, with the result of the comparison. Green rows are fine.',
      ],
      [
        'Needs attention',
        'Everything that needs someone to look at it: probable matches, team differences and players missing from one system.',
      ],
    ],
  ],
  [
    'In one system only',
    [
      [
        'In Thrive, not in FA',
        'Players in Thrive, in a team that should be registered with the FA, who were not found in the FA report. These need action.',
      ],
      [
        'No FA team (U4-U6, training)',
        'Players only in Thrive groups the FA does not cover, such as U4 to U6 and training squads. They do not need FA registration, but they should still have an active mandate: check the Thrive mandate column.',
      ],
      [
        'In FA, not in Thrive',
        'Players registered with the FA but not found in Thrive. Red rows need action. Grey rows are Cancelled or Transferred, so not expected in Thrive.',
      ],
    ],
  ],
  [
    'Differences',
    [
      [
        'Check match',
        'Probably the same person, but the name or date of birth differs between the systems (Sam/Samuel, a typo, a wrong birth year). Confirm, then correct the wrong system.',
      ],
      [
        'Team differs',
        'Matched players whose team in Thrive does not agree with their FA registration.',
      ],
      [
        'Data quality',
        "Likely data entry problems: an adult's date of birth, a parent's name used as the player, a player too old for the team, odd capitalisation, duplicates.",
      ],
    ],
  ],
];

export const BANNER_TEXT =
  "Personal data warning: this tool handles children's personal and medical information, which is " +
  'protected by UK GDPR. Your files never leave your computer: all comparison and exports run in your browser ' +
  'with outgoing network connections blocked. Keep files secure, share only what each person needs, and delete ' +
  'files when they are no longer needed.';

export const WHATSAPP_WARNING =
  "This will show text containing children's personal data (names, ages, parent contact details and " +
  'possibly medical information) that you can paste into WhatsApp.\n\n' +
  'Before you send it:\n' +
  '  - Send it only to the manager and assistant who need it, never to a large group chat.\n' +
  '  - Ask them not to forward it, and to delete the message when it is no longer needed.\n' +
  '  - Keep medical details in a separate message to those who need them.\n' +
  '  - WhatsApp keeps copies on every device in the chat, so be sure everyone in it should see it.\n\n' +
  'Do you want to continue?';

export function export_warning(includes_medical: boolean): string {
  let details = 'names, dates of birth and contact details';
  if (includes_medical) {
    details += ', and medical information';
  }
  return (
    `The file you are about to create contains personal data about children (${details}).\n\n` +
    'Under UK GDPR you must:\n' +
    '  - only share it with people who need it to run the club\n' +
    "  - send each manager only their own team's file, by a secure route\n" +
    '  - keep it secure and delete it when it is no longer needed\n' +
    '  - report any loss or unauthorised sharing straight away\n\n' +
    'Do you want to continue?'
  );
}

export const PROGRESS_STEPS = [
  'Checking the files',
  'Reading the FA registration report',
  'Reading the Thrive export',
  'Reading the managers file',
  'Matching players',
  'Building team sheets and lists',
];

export const HELP_SECTIONS: Array<[string, string, string]> = [
  [
    'quick',
    'Quick start',
    `1. Choose or drag-and-drop your two Excel files in Step 1: the FA player registration report and the Thrive data export. "How to get these files" (in the Step 1 heading, or Help > Getting the exports) has the steps for downloading them and the Thrive columns to include. The FA report is optional: with only the Thrive export you get team sheets, lists and WhatsApp messages, but FA registration is not checked.
2. Click Reconcile. This compares the two lists in your browser in a few seconds; a progress indicator shows each step. Until you do, the tables say "Not reconciled yet". If you choose different files afterwards, Step 2 says "Files changed" until you click Reconcile again.
3. On the Results tab, pick a view on the left. Click (or press Enter on) any row to see all its details.
4. Fix anything that needs attention in Thrive or the FA system.
5. Use Share (Step 3) to download Excel files. "Export team files for managers" downloads a .zip containing one file per team.

Nothing is uploaded and nothing is changed in Thrive or the FA system. The tool only reads your files locally on your computer.`,
  ],
  [
    'exports',
    'Getting the exports',
    `FA player report
1. Go to the club portal: https://clubs.thefa.com/
2. Select Players, then Export > Player information.
3. Wait for the export to be created, then go to My club > Documents and download it. It can take a few minutes to appear.

Thrive data export
1. Log in to Thrive (https://app.thrive4.com/) and go to Contacts.
2. Select the products you are interested in.
3. Open Manage table columns and make sure these are all added:
${rc.THRIVE_ALL_ITEMS.map((item) => '      - ' + item).join('\n')}
4. Click Export.

Some items, such as Medical, add several columns to the export. Name, Date of birth and Teams are essential. If anything else is missing the tool still runs and tells you what to add: without Active pre-authorisation it cannot tell who is paying, and without the contact, medical or consent items those details are blank.`,
  ],
  [
    'results',
    'What the results mean',
    `Matched: same name and date of birth in both systems, and the teams agree.
Matched (team differs): same player, but the team is not the same in both systems.
Matched (data quality): same player, but something in the data looks wrong (see Data quality).
Check match: probably the same person but the name or date of birth differs. Confirm and correct one system.
Thrive only / FA only: the player was not found in the other system.
Thrive only (expected): in Thrive only because the team has no FA equivalent (U4, U5, U6 and training groups). These players do not need FA registration, but they are still checked for an active mandate and appear on the Not paying list without one. On team sheets they are grey and marked "No FA needed".
FA only (not registered): FA status is Cancelled or Transferred, so not expected in Thrive.

Colours and badges: green (✔) is fine, yellow (⚠) needs a look, red (✖) needs action, grey (ℹ) is for information.

Fuzzy matching: names do not have to match exactly. Nicknames (Sam/Samuel), extra middle or double-barrelled names, small typos and swapped first and last names are all recognised, but never reported as an exact match. "Name fuzziness" sets how tolerant typo matching is. Lower is more tolerant, higher is stricter.`,
  ],
  [
    'teams',
    'Team sheets for managers',
    `Pick a team to see its players. Use the arrow buttons either side of the team box (or Alt+Left / Alt+Right) to move to the previous or next team.

The list shows the key facts: name, whether they pay through Thrive, age, where registered, FA status, main contact, whether medical information is recorded, consents and any note. Players not paying (no active mandate, or not in Thrive) have a red row in bold and are marked NOT PAYING, with the number shown in red above the list; tick "Show only not paying" to list just them. Players with medical information are shown in red with a warning symbol (⚠ Yes). Use Search to find a player by name, phone, email or condition, and click a column heading to sort. Click a player (or focus and press Enter) to see everything: all contacts and emails, full medical details and consents.

Each player is coloured by where they are registered for that team:
Green = in both FA and Thrive.   Orange = FA only.   Blue = Thrive only.   Grey = No FA needed.

"Export this team" downloads one team's Excel workbook. "Export team files for managers" in Share downloads a .zip containing one Excel file for every team in a dated folder, ready to send to each manager. Only send each manager their own team's file.

Each team file opens on a Matchday sheet, ready to print (A4 landscape, one page wide): a tick column for who is there, each player's parent contact and phone, the emergency contact, medical alerts highlighted, and whether photos are OK. Blank lines are left for the date, opponent, venue and kick-off. The full player details are on the second sheet.

Untick "Include medical details" to leave medical information out (including the matchday medical alerts).`,
  ],
  [
    'managers',
    'Managers file and WhatsApp',
    `Managers will not have this tool, so the Team sheets tab can make text for you to paste into WhatsApp. Choose a team, click Copy for WhatsApp and you get a squad list (what Thrive has: each player's date of birth and age in years and months, oldest first, with a thumbs up or down for an active direct debit and a total), a squad message (players, contacts, FA and Thrive sign-up and direct debit status) and a separate medical message. Each ends with a data protection reminder.

To show manager names on team sheets and messages, choose an optional Managers file in Step 1. Click Managers template to download an example layout: either one row per person (Name, Role, Team(s)) or one row per team (Team, Manager, Assistant manager). Teams are matched by name, for example U12 Black.

If the managers file has a phone number for the team manager (for example 07700 900010), the WhatsApp window also shows a "Send to <Manager> on WhatsApp..." button. It opens WhatsApp (the app on your phone, or WhatsApp Web on a PC) straight into that manager's chat with the message already filled in, including any edits you made. Nothing is sent until you press send in WhatsApp. UK numbers starting 0 are treated as +44.

The managers list rarely changes, so you can tick "Remember managers list on this device" in Step 1. A copy of the managers file is then kept in this browser and chosen for you next time, so each week you only pick the FA and Thrive files. Untick it to delete the copy. Do not use it on a shared computer.

Send messages only to the people who need them, never to a big group, and ask them to delete them afterwards.`,
  ],
  [
    'paying',
    'Not paying',
    `Lists players who have no active Thrive mandate, plus players registered with the FA but not found in Thrive. These are the players who will not be paying through Thrive.

Players listed as "not found in Thrive" may be there under a different name. Check before you chase.

If the Thrive export has no mandate column (Active pre-authorisation), a red note at the top says so and the list can only show players not found in Thrive.

Use Search and the column headings to narrow and sort the list. Columns that are empty for everyone are hidden.

Copy for WhatsApp makes a message listing each player's name and team, whether they are in the FA system and in Thrive, and whether they have an active mandate. Choose All teams, or one team to send to that team's manager. The team list shows how many players in each team are not paying, and once you pick a team with a manager phone number you can send it straight to their WhatsApp chat.`,
  ],
  [
    'consents',
    'Missing consents',
    `Lists players in Thrive who have not given a consent: photography, code of conduct or club rules. A blank answer, No, declined or anything similar counts as not given, and the answer is shown so you can check it.

Players without photography consent are listed first. Their manager must not photograph them; the team's WhatsApp squad message and matchday sheet both say so.

A consent is only checked if the Thrive export includes it. If one is missing from the export a red note says which, so add it in Thrive (Contacts > Manage table columns) and export again.

Use Export this list to save it as Excel. The full workbook also has a Missing consents sheet.`,
  ],
  [
    'mappings',
    'Team mappings and settings',
    `Thrive and the FA name their teams differently (for example "U07 Eagles" and "Wilpshire Wanderers U7 Eagles"). The Team mappings tab says which Thrive team matches which FA team.

The built-in defaults match your current teams. Each time you reconcile, any new Thrive team gets a suggestion. Anything the tool cannot work out is shown in red so you can choose it yourself.

Choose (ignore) for Thrive groups with no FA team, such as training squads. Changes save automatically in your browser (localStorage). Use Export settings and Import settings to move your mappings between computers or back them up before clearing browser data. Player data is never stored.`,
  ],
  [
    'privacy',
    'Looking after the data',
    `The files contain children's personal and medical details, which are protected by UK GDPR. The web app works entirely inside your browser on your computer: files are read, compared and exported locally and are never uploaded anywhere. Outgoing network connections are blocked by the page's Content Security Policy (connect-src 'none'), and browser storage holds only your team mappings and preferences — never player data. A reminder appears every time you export.

Keep the exports and anything you save secure, only share team files with that team's manager, and delete files when they are no longer needed. This is also an FA requirement for the registration report.`,
  ],
  [
    'trouble',
    'Troubleshooting',
    `"Does not look like the FA report / Thrive export": you picked the wrong file. The tool automatically swaps the two boxes for you if they are the wrong way round.

"Looks like the Thrive data export, but it is missing: ...": add the named items in Thrive under Contacts, Manage table columns, and export again. See Getting the exports.

A message after reconciling lists missing Thrive items: the comparison still ran, but those details are blank. If Active pre-authorisation is missing, Paying shows "? Unknown" for everyone and the Not paying list only has players not found in Thrive.

A player shows as FA only or Thrive only but is in both: their name or date of birth is too different. Correct it in one system and run again, or lower the Name fuzziness a little.`,
  ],
];
