"""Player Reconciliation: FA registration report vs Thrive export (Windows GUI, tkinter)."""
from __future__ import annotations

import json
import os
import sys
import tkinter as tk
from datetime import date
from tkinter import filedialog, messagebox, ttk
from typing import Dict, Optional

import reconcile_core as rc
from version import APP_NAME, APP_TITLE, __version__

SOURCE_COLOURS = {"Both": "#E2F0D9", "FA only": "#FCE4D6", "Thrive only": "#DDEBF7"}
ROW_COLOURS = {"ok": "#E2F0D9", "warn": "#FFF2CC", "bad": "#F8CBAD", "info": "#EDEDED"}
IGNORE_LABEL, UNMAPPED_LABEL = "(ignore)", "(unmapped)"
FONT = ("Segoe UI", 10) if sys.platform == "win32" else None

# Sidebar groups for the Results tab: (group, [(view title, plain-English description)])
VIEW_GROUPS = [
    ("Overview", [
        ("All players", "Every player from both systems, with the result of the comparison. "
                        "Green rows are fine."),
        ("Needs attention", "Everything that needs someone to look at it: probable matches, team differences "
                            "and players missing from one system."),
    ]),
    ("In one system only", [
        ("In Thrive, not in FA", "Players in Thrive that were not found in the FA report. Red rows need action. "
                                 "Grey rows are expected (for example U5/U6 groups the FA does not cover)."),
        ("In FA, not in Thrive", "Players registered with the FA but not found in Thrive. Red rows need action. "
                                 "Grey rows are Cancelled or Transferred, so not expected in Thrive."),
    ]),
    ("Differences", [
        ("Check match", "Probably the same person, but the name or date of birth differs between the systems "
                        "(Sam/Samuel, a typo, a wrong birth year). Confirm, then correct the wrong system."),
        ("Team differs", "Matched players whose team in Thrive does not agree with their FA registration."),
        ("Data quality", "Likely data entry problems: an adult's date of birth, a parent's name used as the "
                         "player, a player too old for the team, odd capitalisation, duplicates."),
    ]),
]

BANNER_TEXT = ("Personal data warning: this tool handles children's personal and medical information, which is "
               "protected by UK GDPR. Keep it secure, share only what each person needs, and delete files when "
               "they are no longer needed.")


WHATSAPP_WARNING = (
    "This will show text containing children's personal data (names, ages, parent contact details and "
    "possibly medical information) that you can paste into WhatsApp.\n\n"
    "Before you send it:\n"
    "  - Send it only to the manager and assistant who need it, never to a large group chat.\n"
    "  - Ask them not to forward it, and to delete the message when it is no longer needed.\n"
    "  - Keep medical details in a separate message to those who need them.\n"
    "  - WhatsApp keeps copies on every device in the chat, so be sure everyone in it should see it.\n\n"
    "Do you want to continue?")


def export_warning(includes_medical: bool) -> str:
    details = "names, dates of birth and contact details"
    if includes_medical:
        details += ", and medical information"
    return (f"The file you are about to create contains personal data about children ({details}).\n\n"
            "Under UK GDPR you must:\n"
            "  - only share it with people who need it to run the club\n"
            "  - send each manager only their own team's file, by a secure route\n"
            "  - keep it secure and delete it when it is no longer needed\n"
            "  - report any loss or unauthorised sharing straight away\n\n"
            "Do you want to continue?")


HELP = [
    ("quick", "Quick start", """\
1.  Click Find my latest exports (or Browse) and choose the two Excel files: the FA player registration report \
and the Thrive data export.
2.  Click Reconcile. This compares the two lists and takes a few seconds.
3.  On the Results tab, pick a view on the left. Double-click any row to see all its details.
4.  Fix anything that needs attention in Thrive or the FA system.
5.  Use Share to save Excel files. "Export team files for managers" creates one file per team.

Nothing is changed in Thrive or the FA system. The tool only reads your two files."""),
    ("results", "What the results mean", """\
Matched: same name and date of birth in both systems, and the teams agree.
Matched (team differs): same player, but the team is not the same in both systems.
Matched (data quality): same player, but something in the data looks wrong (see Data quality).
Check match: probably the same person but the name or date of birth differs. Confirm and correct one system.
Thrive only / FA only: the player was not found in the other system.
Thrive only (expected): in Thrive only because the team has no FA equivalent (for example U5, U6, training groups).
FA only (not registered): FA status is Cancelled or Transferred, so not expected in Thrive.

Colours: green is fine, yellow needs a look, red needs action, grey is for information.

Fuzzy matching: names do not have to match exactly. Nicknames (Sam/Samuel), extra middle or double-barrelled names, \
small typos and swapped first and last names are all recognised, but never reported as an exact match. \
"Name fuzziness" sets how tolerant typo matching is. Lower is more tolerant, higher is stricter."""),
    ("teams", "Team sheets for managers", """\
Pick a team to see its players with contacts (from both systems), medical information and consents.

Each player is coloured by where they are registered for that team:
Green = in both FA and Thrive.   Orange = FA only.   Blue = Thrive only.

"Export this team" saves one team. "Export team files for managers" in Share saves one file for every team into a \
dated folder, ready to send to each manager. Only send each manager their own team's file.

Untick "Include medical details" to leave medical information out."""),
    ("managers", "Managers file and WhatsApp", """\
Managers will not have this tool, so the Team sheets tab can make text for you to paste into WhatsApp. Choose a team, \
click Copy for WhatsApp and you get a squad message (players, contacts, FA and Thrive sign-up and direct debit \
status) and a separate medical message. Each ends with a data protection reminder.

To show manager names on team sheets and messages, choose an optional Managers file in Step 1. Click \
Save a managers file template to see the layout: either one row per person (Name, Role, Team(s)) or one row per \
team (Team, Manager, Assistant manager). Teams are matched by name, for example U12 Black.

Send messages only to the people who need them, never to a big group, and ask them to delete them afterwards."""),
    ("paying", "Not paying", """\
Lists players who have no active Thrive mandate, plus players registered with the FA but not found in Thrive. \
These are the players who will not be paying through Thrive.

Players listed as "not found in Thrive" may be there under a different name. Check before you chase."""),
    ("mappings", "Team mappings", """\
Thrive and the FA name their teams differently (for example "U07 Eagles" and "Wilpshire Wanderers U7 Eagles"). \
The Team mappings tab says which Thrive team matches which FA team.

The built-in defaults match your current teams. Each time you reconcile, any new Thrive team gets a suggestion. \
Anything the tool cannot work out is shown in red so you can choose it yourself.

Choose (ignore) for Thrive groups with no FA team, such as training squads. Changes save automatically."""),
    ("privacy", "Looking after the data", """\
The files contain children's personal and medical details, which are protected by UK GDPR. The tool works \
entirely on your computer and sends nothing anywhere. A reminder appears every time you export.

Keep the exports and anything you save secure, only share team files with that team's manager, and delete \
files when they are no longer needed. This is also an FA requirement for the registration report."""),
    ("trouble", "Troubleshooting", """\
"Does not look like the FA report / Thrive export": you picked the wrong file. The tool can swap the two boxes \
for you if they are the wrong way round.

"Could not save": the Excel file is probably open. Close it and try again.

A player shows as FA only or Thrive only but is in both: their name or date of birth is too different. Correct \
it in one system and run again, or lower the Name fuzziness a little."""),
]


# --------------------------------------------------------------------------- helpers

class Tooltip:
    """Small hover hint for a widget."""

    def __init__(self, widget, text: str, delay: int = 500) -> None:
        self.widget, self.text, self.delay = widget, text, delay
        self.tip = None
        self.job = None
        widget.bind("<Enter>", self._schedule, add="+")
        widget.bind("<Leave>", self._hide, add="+")
        widget.bind("<ButtonPress>", self._hide, add="+")

    def _schedule(self, _event=None) -> None:
        self._cancel()
        self.job = self.widget.after(self.delay, self._show)

    def _cancel(self) -> None:
        if self.job:
            self.widget.after_cancel(self.job)
            self.job = None

    def _show(self) -> None:
        if self.tip or not self.text:
            return
        x = self.widget.winfo_rootx() + 12
        y = self.widget.winfo_rooty() + self.widget.winfo_height() + 4
        self.tip = tk.Toplevel(self.widget)
        self.tip.wm_overrideredirect(True)
        self.tip.wm_geometry(f"+{x}+{y}")
        tk.Label(self.tip, text=self.text, justify="left", background="#FFFFE1", relief="solid",
                 borderwidth=1, wraplength=340, padx=6, pady=3, font=FONT).pack()

    def _hide(self, _event=None) -> None:
        self._cancel()
        if self.tip:
            self.tip.destroy()
            self.tip = None


def tip(widget, text: str):
    Tooltip(widget, text)
    return widget


def config_path() -> str:
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    folder = os.path.join(base, APP_NAME)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "config.json")


def load_config() -> dict:
    cfg = {"fa_path": "", "thrive_path": "", "staff_path": "", "fuzzy": rc.DEFAULT_FUZZY, "medical": True,
           "team_map": dict(rc.DEFAULT_TEAM_MAP)}
    try:
        with open(config_path(), encoding="utf-8") as fh:
            saved = json.load(fh)
        cfg.update({k: saved[k] for k in cfg if k in saved})
    except (OSError, ValueError):
        pass  # first run or unreadable file: fall back to the defaults
    return cfg


def save_config(cfg: dict) -> None:
    try:
        with open(config_path(), "w", encoding="utf-8") as fh:
            json.dump(cfg, fh, indent=2)
    except OSError as exc:
        messagebox.showwarning("Settings", f"Could not save settings: {exc}")


def asset(name: str) -> str:
    """Path to a bundled file, both when run as a script and when frozen by PyInstaller."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "assets", name)


def fix_treeview_tags() -> None:
    """Tk 8.6.9 ignores Treeview tag colours. Standard workaround."""
    style = ttk.Style()

    def fixed_map(option):
        return [e for e in style.map("Treeview", query_opt=option) if e[:2] != ("!disabled", "!selected")]
    style.map("Treeview", foreground=fixed_map("foreground"), background=fixed_map("background"))


def open_folder(path: str) -> None:
    try:
        if sys.platform == "win32":
            os.startfile(path)  # noqa: S606
    except OSError:
        pass


# --------------------------------------------------------------------------- app

class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(f"{APP_TITLE} v{__version__}: FA vs Thrive")
        self.geometry("1360x800")
        self.minsize(1100, 650)
        try:  # sharp text on high-DPI Windows displays
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass
        style = ttk.Style(self)
        if "vista" in style.theme_names():
            style.theme_use("vista")
        if FONT:
            style.configure(".", font=FONT)
        style.configure("Treeview", rowheight=24)
        style.configure("Accent.TButton", font=("Segoe UI", 11, "bold") if FONT else None, padding=8)
        style.configure("Heading.TLabel", font=("Segoe UI", 13, "bold") if FONT else None)
        style.configure("Hint.TLabel", foreground="#1F4E79")
        style.configure("Warn.TLabel", foreground="#C00000")
        fix_treeview_tags()

        self.cfg = load_config()
        self.team_map: Dict[str, Optional[str]] = dict(self.cfg["team_map"])
        self.fa_players = None
        self.thrive_players = None
        self.result: Optional[rc.Result] = None
        self.sort_state = (None, False)
        self.current_view = "All players"
        self.help_win = None

        self.fa_var = tk.StringVar(value=self.cfg["fa_path"])
        self.thrive_var = tk.StringVar(value=self.cfg["thrive_path"])
        self.staff_var = tk.StringVar(value=self.cfg["staff_path"])
        self.staff = []
        self.medical_var = tk.BooleanVar(value=bool(self.cfg.get("medical", True)))
        self.fuzzy_var = tk.StringVar(value=f"{float(self.cfg['fuzzy']):.2f}")
        self.search_var = tk.StringVar()
        self.hint_var = tk.StringVar()
        self.status_var = tk.StringVar(value=f"Version {__version__}")
        self.summary_var = tk.StringVar()
        self.view_title_var = tk.StringVar()
        self.view_desc_var = tk.StringVar()
        self.team_var = tk.StringVar()
        self.team_summary_var = tk.StringVar()
        self.map_warn_var = tk.StringVar()
        self.export_buttons = []

        self._load_logo()
        self._build_menu()
        self._build_banner()
        self._build_top_bar()
        ttk.Label(self, textvariable=self.hint_var, style="Hint.TLabel", wraplength=1200,
                  padding=(12, 0, 12, 4)).pack(fill="x")
        ttk.Label(self, textvariable=self.status_var, anchor="w", relief="sunken", padding=(6, 1)
                  ).pack(fill="x", side="bottom")
        self.nb = ttk.Notebook(self)
        self.nb.pack(fill="both", expand=True, padx=8, pady=(0, 4))
        self._build_results_tab()
        self._build_team_tab()
        self._build_not_paying_tab()
        self._build_mapping_tab()
        self._refresh_mapping_table()
        self._set_exports_enabled(False)
        self._select_view("All players")
        self.hint_var.set("Start here: choose your FA report and your Thrive export in step 1 "
                          "(or click \"Find my latest exports\"), then click Reconcile.")
        self.bind("<F1>", lambda _e: self.show_help("quick"))
        self.bind("<Control-r>", lambda _e: self.run())

    # ------------------------------------------------------------------ layout
    def _load_logo(self) -> None:
        """Club crest as window icon and header image. Missing files are not fatal."""
        self.logo = None
        try:
            self.logo = tk.PhotoImage(file=asset("logo_64.png"))
            self.iconphoto(True, tk.PhotoImage(file=asset("logo_32.png")), self.logo)
            if sys.platform == "win32":
                self.iconbitmap(asset("icon.ico"))
        except tk.TclError:
            pass

    def _build_menu(self) -> None:
        bar = tk.Menu(self)
        file_menu = tk.Menu(bar, tearoff=0)
        file_menu.add_command(label="Reconcile", accelerator="Ctrl+R", command=self.run)
        file_menu.add_separator()
        file_menu.add_command(label="Export full workbook...", command=self.export)
        file_menu.add_command(label="Export team files for managers...", command=self.export_each_team)
        file_menu.add_command(label="Save a managers file template...", command=self.save_staff_template)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.destroy)
        bar.add_cascade(label="File", menu=file_menu)
        help_menu = tk.Menu(bar, tearoff=0)
        help_menu.add_command(label="How to use this tool", accelerator="F1", command=lambda: self.show_help("quick"))
        help_menu.add_command(label="What the results mean", command=lambda: self.show_help("results"))
        help_menu.add_command(label="Team sheets and sharing", command=lambda: self.show_help("teams"))
        help_menu.add_command(label="Looking after the data", command=lambda: self.show_help("privacy"))
        help_menu.add_separator()
        help_menu.add_command(label=f"About {APP_TITLE}", command=self.show_about)
        bar.add_cascade(label="Help", menu=help_menu)
        self.config(menu=bar)

    def _build_banner(self) -> None:
        """Permanent data protection notice across the top of the window."""
        banner = tk.Frame(self, background="#FFF2CC", highlightbackground="#BF9000", highlightthickness=1)
        banner.pack(fill="x")
        label = tk.Label(banner, text=BANNER_TEXT, background="#FFF2CC", foreground="#7F1D1D", justify="left",
                         anchor="w", font=FONT, wraplength=1100)
        label.pack(side="left", fill="x", expand=True, padx=10, pady=5)
        link = ttk.Button(banner, text="Data protection guidance", command=lambda: self.show_help("privacy"))
        link.pack(side="right", padx=8, pady=4)
        tip(link, "Opens the help section on looking after the data.")
        banner.bind("<Configure>", lambda e: label.configure(wraplength=max(300, e.width - 230)))

    def _build_top_bar(self) -> None:
        bar = ttk.Frame(self, padding=(8, 8, 8, 2))
        bar.pack(fill="x")
        bar.columnconfigure(1, weight=1)
        if self.logo:
            ttk.Label(bar, image=self.logo).grid(row=0, column=0, sticky="n", padx=(0, 10))

        files = ttk.LabelFrame(bar, text=" Step 1: choose your two files ", padding=8)
        files.grid(row=0, column=1, sticky="ew")
        files.columnconfigure(1, weight=1)
        rows = (("FA registration report", self.fa_var, "The Excel report downloaded from the FA player registration "
                                                      "system (Club - Player Report)."),
                ("Thrive data export", self.thrive_var, "The Excel data export downloaded from Thrive."),
                ("Managers file (optional)", self.staff_var, "Optional. An Excel or CSV list of managers, assistant "
                 "managers and their teams. Their names then appear on team sheets and messages. Use Save a "
                 "template to see the layout."))
        for i, (label, var, hint) in enumerate(rows):
            ttk.Label(files, text=label).grid(row=i, column=0, sticky="w", padx=(0, 8), pady=2)
            tip(ttk.Entry(files, textvariable=var), hint).grid(row=i, column=1, sticky="ew", pady=2)
            tip(ttk.Button(files, text="Browse...", command=lambda v=var: self._browse(v)),
                "Choose the file from your computer.").grid(row=i, column=2, padx=(8, 0))
        tip(ttk.Button(files, text="Find my latest exports", command=self._find_latest),
            "Looks in your Downloads folder for the newest FA report and Thrive export and fills in both boxes."
            ).grid(row=3, column=1, sticky="w", pady=(4, 0))
        tip(ttk.Button(files, text="Save a managers file template...", command=self.save_staff_template),
            "Saves an example managers file you can fill in, with instructions.").grid(row=3, column=1, sticky="e",
                                                                                      pady=(4, 0))

        go = ttk.LabelFrame(bar, text=" Step 2: compare ", padding=8)
        go.grid(row=0, column=2, sticky="ns", padx=8)
        tip(ttk.Button(go, text="Reconcile", style="Accent.TButton", command=self.run),
            "Compare the two files. Nothing is changed in Thrive or the FA system. (Ctrl+R)").pack(fill="both", expand=True)

        share = ttk.LabelFrame(bar, text=" Step 3: share ", padding=8)
        share.grid(row=0, column=3, sticky="ns")
        b1 = tip(ttk.Button(share, text="Export team files for managers...", command=self.export_each_team),
                 "Creates one Excel file per team, in a dated folder, ready to send to each manager.")
        b2 = tip(ttk.Button(share, text="Export full workbook...", command=self.export),
                 "One Excel file with every view, the not-paying list and a sheet for each team.")
        b1.pack(fill="x")
        b2.pack(fill="x", pady=(4, 4))
        tip(ttk.Checkbutton(share, text="Include medical details", variable=self.medical_var,
                            command=self._medical_changed),
            "Untick to leave medical information out of team sheets and exports.").pack(anchor="w")
        self.export_buttons += [b1, b2]

    def _build_results_tab(self) -> None:
        tab = ttk.Frame(self.nb, padding=6)
        self.nb.add(tab, text="  Results  ")
        side = ttk.Frame(tab)
        side.pack(side="left", fill="y", padx=(0, 8))
        ttk.Label(side, text="Choose a view", style="Heading.TLabel").pack(anchor="w", pady=(0, 4))
        self.view_tree = ttk.Treeview(side, show="tree", selectmode="browse", height=14)
        self.view_tree.column("#0", width=260)
        for group, views in VIEW_GROUPS:
            gid = self.view_tree.insert("", "end", iid="g:" + group, text=group, open=True, tags=("group",))
            for title, _ in views:
                self.view_tree.insert(gid, "end", iid=title, text=title)
        self.view_tree.tag_configure("group", foreground="#666666")
        self.view_tree.pack(fill="y", expand=True)
        self.view_tree.bind("<<TreeviewSelect>>", self._on_view_select)
        tip(self.view_tree, "Click a view to show only those players. The number is how many players it holds.")

        box = ttk.LabelFrame(side, text=" Matching settings ", padding=6)
        box.pack(fill="x", pady=(8, 0))
        ttk.Label(box, text="Name fuzziness").grid(row=0, column=0, sticky="w")
        spin = ttk.Spinbox(box, textvariable=self.fuzzy_var, from_=0.6, to=1.0, increment=0.05, width=5,
                           format="%.2f", command=self._fuzzy_changed)
        spin.grid(row=0, column=1, padx=6)
        spin.bind("<Return>", lambda _e: self._fuzzy_changed())
        spin.bind("<FocusOut>", lambda _e: self._fuzzy_changed())
        tip(spin, "How alike two names must be to count as the same person (0.60 to 1.00). Lower is more "
                  "tolerant of typos but may suggest wrong matches. Default 0.80.")
        ttk.Label(box, text="Lower = more tolerant of typos", style="Hint.TLabel").grid(
            row=1, column=0, columnspan=2, sticky="w")

        main = ttk.Frame(tab)
        main.pack(side="left", fill="both", expand=True)
        head = ttk.Frame(main)
        head.pack(fill="x")
        ttk.Label(head, textvariable=self.view_title_var, style="Heading.TLabel").pack(side="left")
        ttk.Label(head, textvariable=self.summary_var, style="Hint.TLabel").pack(side="right")
        ttk.Label(main, textvariable=self.view_desc_var, wraplength=980, justify="left").pack(fill="x", pady=(0, 6))
        find = ttk.Frame(main)
        find.pack(fill="x", pady=(0, 6))
        ttk.Label(find, text="Search").pack(side="left")
        entry = ttk.Entry(find, textvariable=self.search_var, width=30)
        entry.pack(side="left", padx=6)
        entry.bind("<KeyRelease>", lambda _e: self._fill_results())
        tip(entry, "Type part of a name, team or issue to narrow the list.")
        ttk.Label(find, text="Double-click a row for full details. Click a column heading to sort.",
                  style="Hint.TLabel").pack(side="left", padx=12)
        frame = ttk.Frame(main)
        frame.pack(fill="both", expand=True)
        self.tree = ttk.Treeview(frame, columns=[c[1] for c in rc.COLUMNS], show="headings", selectmode="browse")
        for title, attr, width in rc.COLUMNS:
            self.tree.heading(attr, text=title, command=lambda a=attr: self._sort_by(a))
            self.tree.column(attr, width=min(width * 7, 420), anchor="w")
        self._attach_scrollbars(frame, self.tree)
        for level, colour in ROW_COLOURS.items():
            self.tree.tag_configure(level, background=colour)
        self.tree.bind("<Double-1>", lambda _e: self._row_detail(self.tree))

    @staticmethod
    def _attach_scrollbars(frame, tree) -> None:
        ys = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        xs = ttk.Scrollbar(frame, orient="horizontal", command=tree.xview)
        tree.configure(yscrollcommand=ys.set, xscrollcommand=xs.set)
        tree.grid(row=0, column=0, sticky="nsew")
        ys.grid(row=0, column=1, sticky="ns")
        xs.grid(row=1, column=0, sticky="ew")
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

    def _make_tree(self, parent):
        frame = ttk.Frame(parent)
        frame.pack(fill="both", expand=True)
        tree = ttk.Treeview(frame, show="headings", selectmode="browse")
        self._attach_scrollbars(frame, tree)
        for tag, colour in SOURCE_COLOURS.items():
            tree.tag_configure(tag, background=colour)
        tree.bind("<Double-1>", lambda _e: self._row_detail(tree))
        return tree

    @staticmethod
    def _show_table(tree, headers, rows) -> None:
        tree["columns"] = list(range(len(headers)))
        for i, title in enumerate(headers):
            tree.heading(i, text=title)
            tree.column(i, width=max(70, min(len(title) * 9, 220)), anchor="w")
        tree.delete(*tree.get_children())
        for values, source in rows:
            tree.insert("", "end", tags=(source,), values=[
                v.strftime("%d/%m/%Y") if isinstance(v, date) else v for v in values])

    def _build_team_tab(self) -> None:
        tab = ttk.Frame(self.nb, padding=6)
        self.nb.add(tab, text="  Team sheets  ")
        ttk.Label(tab, style="Hint.TLabel", wraplength=1100, text=(
            "For team managers: pick a team to see its players with contacts, medical information and consents. "
            "Double-click a player for full details.")).pack(anchor="w")
        top = ttk.Frame(tab)
        top.pack(fill="x", pady=6)
        ttk.Label(top, text="Team", style="Heading.TLabel").pack(side="left")
        self.team_box = ttk.Combobox(top, textvariable=self.team_var, state="readonly", width=26)
        self.team_box.pack(side="left", padx=8)
        self.team_box.bind("<<ComboboxSelected>>", lambda _e: self._fill_team_tab())
        tip(self.team_box, "Choose the team to show.")
        for text, colour in SOURCE_COLOURS.items():
            tip(ttk.Label(top, text=f"  {text}  ", background=colour),
                {"Both": "Registered in both the FA system and Thrive for this team.",
                 "FA only": "Registered with the FA for this team but not in Thrive.",
                 "Thrive only": "In this team in Thrive but not registered with the FA for it."}[text]
                ).pack(side="left", padx=2)
        ttk.Label(top, textvariable=self.team_summary_var).pack(side="left", padx=12)
        b_each = tip(ttk.Button(top, text="Export team files for managers...", command=self.export_each_team),
                     "One Excel file per team, in a dated folder.")
        b_one = tip(ttk.Button(top, text="Export this team...", command=self.export_team),
                    "Save the team shown here as an Excel file.")
        b_wa = tip(ttk.Button(top, text="Copy for WhatsApp...", command=self.copy_whatsapp),
                   "Text you can paste into WhatsApp: squad, contacts, sign-up status and direct debit, and a "
                   "separate medical message.")
        b_each.pack(side="right")
        b_one.pack(side="right", padx=6)
        b_wa.pack(side="right")
        b_mp = tip(ttk.Button(top, text="Copy manager phone", command=lambda: self.copy_phone("manager")),
                   "Copies the manager's phone number from the managers file, to paste into WhatsApp and find "
                   "their chat. Then use Copy for WhatsApp to send the team details.")
        b_ap = tip(ttk.Button(top, text="Copy assistant phone", command=lambda: self.copy_phone("assistant")),
                   "Copies the assistant manager's phone number from the managers file.")
        b_ap.pack(side="right", padx=(0, 6))
        b_mp.pack(side="right", padx=(0, 6))
        self.export_buttons += [b_each, b_one, b_wa, b_mp, b_ap]
        self.team_tree = self._make_tree(tab)

    def _build_not_paying_tab(self) -> None:
        tab = ttk.Frame(self.nb, padding=6)
        self.nb.add(tab, text="  Not paying  ")
        self.np_tab = tab
        top = ttk.Frame(tab)
        top.pack(fill="x", pady=(0, 6))
        ttk.Label(top, style="Hint.TLabel", wraplength=1000, justify="left", text=(
            "Players with no active Thrive mandate, plus players registered with the FA but not found in Thrive: "
            "the ones who will not be paying through Thrive. FA-only players may be in Thrive under another "
            "name, so check before you chase.")).pack(side="left")
        b = tip(ttk.Button(top, text="Export this list...", command=self.export_not_paying),
                "Save this list as an Excel file.")
        b.pack(side="right")
        self.export_buttons.append(b)
        self.np_tree = self._make_tree(tab)

    def _build_mapping_tab(self) -> None:
        tab = ttk.Frame(self.nb, padding=6)
        self.nb.add(tab, text="  Team mappings  ")
        self.map_tab = tab
        ttk.Label(tab, wraplength=1100, justify="left", text=(
            "Thrive and the FA name their teams differently. This list says which Thrive team matches which FA "
            "team. The defaults suit your current teams. To change one, click a row, choose the FA team below and "
            "click Apply. Choose (ignore) for Thrive groups with no FA team, such as training squads. "
            "Changes save automatically.")).pack(anchor="w")
        ttk.Label(tab, textvariable=self.map_warn_var, style="Warn.TLabel").pack(anchor="w", pady=(4, 4))
        frame = ttk.Frame(tab)
        frame.pack(fill="both", expand=True)
        self.map_tree = ttk.Treeview(frame, columns=("thrive", "fa", "count"), show="headings", selectmode="browse")
        for col, title, width in (("thrive", "Thrive team", 220), ("fa", "FA team", 320),
                                  ("count", "Players in Thrive file", 150)):
            self.map_tree.heading(col, text=title)
            self.map_tree.column(col, width=width, anchor="w")
        sb = ttk.Scrollbar(frame, orient="vertical", command=self.map_tree.yview)
        self.map_tree.configure(yscrollcommand=sb.set)
        self.map_tree.pack(side="left", fill="both", expand=True)
        sb.pack(side="left", fill="y")
        self.map_tree.tag_configure("unmapped", background=ROW_COLOURS["bad"])
        self.map_tree.tag_configure("ignored", background=ROW_COLOURS["info"])
        self.map_tree.bind("<<TreeviewSelect>>", self._on_map_select)
        tip(self.map_tree, "Red = needs a decision. Grey = ignored (no FA team).")

        edit = ttk.LabelFrame(tab, text=" Change the selected mapping ", padding=8)
        edit.pack(fill="x", pady=(8, 0))
        self.sel_var, self.target_var, self.new_var = tk.StringVar(), tk.StringVar(), tk.StringVar()
        ttk.Label(edit, text="Thrive team").grid(row=0, column=0, sticky="w")
        ttk.Label(edit, textvariable=self.sel_var, width=24, font=("Segoe UI", 10, "bold") if FONT else None
                  ).grid(row=0, column=1, sticky="w", padx=8)
        ttk.Label(edit, text="matches FA team").grid(row=0, column=2, sticky="w")
        self.target_box = ttk.Combobox(edit, textvariable=self.target_var, state="readonly", width=40)
        self.target_box.grid(row=0, column=3, padx=8)
        tip(ttk.Button(edit, text="Apply", command=self._apply_mapping), "Save this choice.").grid(row=0, column=4)
        tip(ttk.Button(edit, text="Remove row", command=self._remove_mapping),
            "Delete this mapping. The team will show as unmapped until you choose again.").grid(row=0, column=5, padx=8)

        tools = ttk.Frame(tab)
        tools.pack(fill="x", pady=(8, 0))
        ttk.Label(tools, text="Add a Thrive team by name").pack(side="left")
        ttk.Entry(tools, textvariable=self.new_var, width=24).pack(side="left", padx=6)
        ttk.Button(tools, text="Add", command=self._add_mapping).pack(side="left")
        tip(ttk.Button(tools, text="Reset to defaults", command=self._reset_mapping),
            "Go back to the built-in mapping.").pack(side="right")
        tip(ttk.Button(tools, text="Suggest for unmapped", command=self._suggest_unmapped),
            "Fill in red rows where the tool can work out the FA team from the name.").pack(side="right", padx=8)

    # ------------------------------------------------------------------ help
    def show_help(self, section: str = "quick") -> None:
        if self.help_win is not None and self.help_win.winfo_exists():
            self.help_win.destroy()
        win = self.help_win = tk.Toplevel(self)
        win.title(f"{APP_TITLE} help")
        win.geometry("760x620")
        text = tk.Text(win, wrap="word", padx=14, pady=10, font=FONT, spacing3=4)
        sb = ttk.Scrollbar(win, orient="vertical", command=text.yview)
        text.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        text.pack(fill="both", expand=True)
        text.tag_configure("h", font=("Segoe UI", 13, "bold") if FONT else None, spacing1=14, spacing3=6,
                           foreground="#1F4E79")
        for key, title, body in HELP:
            text.mark_set(key, "end-1c")
            text.mark_gravity(key, "left")
            text.insert("end", title + "\n", "h")
            text.insert("end", body + "\n")
        text.insert("end", f"\n{APP_TITLE} version {__version__}\n")
        text.configure(state="disabled")
        text.see(section)
        text.yview(section)

    def show_about(self) -> None:
        messagebox.showinfo(
            f"About {APP_TITLE}",
            f"{APP_TITLE}\nVersion {__version__}\n\n"
            "Compares the FA player registration report with the Thrive export, flags data quality problems "
            "and produces team sheets for managers.\n\n"
            "Works entirely on this computer. Nothing is sent anywhere.\n\n"
            f"Settings are saved in:\n{config_path()}")

    # ------------------------------------------------------------------ file handling
    def _browse(self, var: tk.StringVar) -> None:
        start = os.path.dirname(var.get()) if var.get() else os.path.join(os.path.expanduser("~"), "Downloads")
        path = filedialog.askopenfilename(initialdir=start if os.path.isdir(start) else None,
                                          title="Select Excel file",
                                          filetypes=[("Excel or CSV files", "*.xlsx *.xlsm *.csv"), ("All files", "*.*")])
        if path:
            var.set(path)

    def _find_latest(self) -> None:
        folder = os.path.join(os.path.expanduser("~"), "Downloads")
        if not os.path.isdir(folder):
            folder = filedialog.askdirectory(title="Where are your downloaded files?")
        if not folder:
            return
        self.config(cursor="watch")
        self.update_idletasks()
        try:
            found = rc.find_latest_exports(folder)
        finally:
            self.config(cursor="")
        if "fa" in found:
            self.fa_var.set(found["fa"])
        if "thrive" in found:
            self.thrive_var.set(found["thrive"])
        if len(found) == 2:
            self.hint_var.set("Found both files. Check they are the ones you want, then click Reconcile.")
        elif found:
            missing = "Thrive export" if "fa" in found else "FA report"
            self.hint_var.set(f"Found one file, but no {missing} in {folder}. Use Browse for the other.")
        else:
            messagebox.showinfo("Find my latest exports",
                                f"No FA report or Thrive export found in:\n{folder}\n\nUse Browse to choose them.")

    def run(self) -> None:
        fa_path, thrive_path = self.fa_var.get().strip(), self.thrive_var.get().strip()
        if not (os.path.isfile(fa_path) and os.path.isfile(thrive_path)):
            messagebox.showinfo("Choose your files",
                                "Please choose both files first:\n\n  the FA registration report\n"
                                "  the Thrive data export\n\nOr click \"Find my latest exports\".")
            return
        self.config(cursor="watch")
        self.update_idletasks()
        try:
            if (rc.detect_kind(fa_path), rc.detect_kind(thrive_path)) == ("thrive", "fa"):
                fa_path, thrive_path = thrive_path, fa_path  # chosen the wrong way round
                self.fa_var.set(fa_path)
                self.thrive_var.set(thrive_path)
                messagebox.showinfo("Files swapped", "The two files were in the wrong boxes, so I swapped them.")
            self.fa_players = rc.load_fa(fa_path)
            self.thrive_players = rc.load_thrive(thrive_path)
        except rc.ReportError as exc:
            messagebox.showerror("Could not read file", f"{exc}\n\nCheck each file is in the right box.")
            return
        finally:
            self.config(cursor="")
        self.staff = []
        staff_path = self.staff_var.get().strip()
        if staff_path:
            try:
                self.staff = rc.load_staff(staff_path)
            except (rc.ReportError, OSError) as exc:
                messagebox.showwarning("Managers file not used", f"{exc}\n\nThe comparison will carry on without it.")
        self.cfg.update(fa_path=fa_path, thrive_path=thrive_path, staff_path=staff_path)
        added = self._suggest_unmapped(quiet=True)
        self._recompute()
        self._set_exports_enabled(True)
        missing = self._unmapped_teams()
        msg = (f"Compared {len(self.fa_players)} FA players with {len(self.thrive_players)} Thrive players. "
               "Pick a view on the left of the Results tab. Double-click any row for the full details.")
        if added:
            msg += f" {added} new Thrive team(s) were matched automatically."
        if missing:
            msg += f" {len(missing)} Thrive team(s) need a decision on the Team mappings tab."
            self.nb.select(self.map_tab)
        self.hint_var.set(msg)
        self.status_var.set(f"Reconciled at {date.today():%d/%m/%Y}   |   {os.path.basename(fa_path)}   |   "
                            f"{os.path.basename(thrive_path)}")
        self._persist()

    def _set_exports_enabled(self, enabled: bool) -> None:
        for b in self.export_buttons:
            b.state(["!disabled"] if enabled else ["disabled"])

    def _recompute(self) -> None:
        if self.fa_players is None:
            return
        self.result = rc.reconcile(self.fa_players, self.thrive_players, self.team_map, self._fuzzy())
        rc.attach_staff(self.result, self.staff, self.team_map)
        counts = self.result.counts()
        attention = sum(n for k, n in counts.items() if rc.LEVELS[k] in ("bad", "warn"))
        self.summary_var.set(f"{counts.get('Matched', 0)} fully matched   |   {attention} need attention")
        for title, pred in rc.RESULT_TABS:
            n = sum(1 for r in self.result.rows if pred(r))
            self.view_tree.item(title, text=f"{title}  ({n})")
        self._fill_results()
        headers, np_rows = rc.not_paying_report(self.result)
        self._show_table(self.np_tree, headers, np_rows)
        self.nb.tab(self.np_tab, text=f"  Not paying ({len(np_rows)})  ")
        labels = rc.team_labels(self.result)
        self.team_box["values"] = labels
        if self.team_var.get() not in labels:
            self.team_var.set(labels[0] if labels else "")
        self._fill_team_tab()
        self._refresh_mapping_table()

    # ------------------------------------------------------------------ results
    def _on_view_select(self, _event=None) -> None:
        sel = self.view_tree.selection()
        if not sel:
            return
        if sel[0].startswith("g:"):  # a group heading: select its first view instead
            self.view_tree.selection_set(self.view_tree.get_children(sel[0])[0])
            return
        self.current_view = sel[0]
        self._update_view_heading()
        self._fill_results()

    def _select_view(self, title: str) -> None:
        self.view_tree.selection_set(title)
        self.current_view = title
        self._update_view_heading()

    def _update_view_heading(self) -> None:
        self.view_title_var.set(self.current_view)
        for _, views in VIEW_GROUPS:
            for title, desc in views:
                if title == self.current_view:
                    self.view_desc_var.set(desc)

    def _visible_rows(self):
        pred = dict(rc.RESULT_TABS)[self.current_view]
        rows = [r for r in (self.result.rows if self.result else []) if pred(r)]
        term = self.search_var.get().strip().lower()
        if term:
            rows = [r for r in rows if term in " ".join(str(getattr(r, a)) for _, a, _ in rc.COLUMNS).lower()]
        col, desc = self.sort_state
        if col:
            rows = sorted(rows, key=lambda r: str(getattr(r, col) or "").lower(), reverse=desc)
        return rows

    def _fill_results(self) -> None:
        self.tree.delete(*self.tree.get_children())
        for row in self._visible_rows():
            values = []
            for _, attr, _ in rc.COLUMNS:
                v = getattr(row, attr)
                values.append(v.strftime("%d/%m/%Y") if isinstance(v, date) else v)
            self.tree.insert("", "end", values=values, tags=(row.level,))

    def _sort_by(self, col: str) -> None:
        prev, desc = self.sort_state
        self.sort_state = (col, not desc if prev == col else False)
        self._fill_results()

    def _fuzzy(self) -> float:
        try:
            return min(1.0, max(0.6, float(self.fuzzy_var.get())))
        except ValueError:
            return rc.DEFAULT_FUZZY

    def _fuzzy_changed(self) -> None:
        value = self._fuzzy()
        self.fuzzy_var.set(f"{value:.2f}")
        if value != self.cfg.get("fuzzy"):
            self.cfg["fuzzy"] = value
            self._persist()
            self._recompute()

    def _row_detail(self, tree) -> None:
        """Show every field of the selected row in a readable window."""
        sel = tree.selection()
        if not sel:
            return
        values = tree.item(sel[0], "values")
        headers = [tree.heading(c, "text") for c in tree["columns"]]
        win = tk.Toplevel(self)
        win.title("Details")
        win.geometry("640x560")
        text = tk.Text(win, wrap="word", padx=12, pady=10, font=FONT, spacing3=3)
        text.pack(fill="both", expand=True)
        text.tag_configure("k", font=("Segoe UI", 10, "bold") if FONT else None, foreground="#1F4E79")
        for h, v in zip(headers, values):
            if str(v).strip():
                text.insert("end", f"{h}\n", "k")
                text.insert("end", f"{v}\n")
        text.configure(state="disabled")
        ttk.Button(win, text="Close", command=win.destroy).pack(pady=6)

    # ------------------------------------------------------------------ team sheets
    def _fill_team_tab(self) -> None:
        label = self.team_var.get()
        if not self.result or label not in self.result.teams:
            self.team_summary_var.set("")
            return
        headers, rows = rc.team_report(self.result, label, self.medical_var.get())
        self._show_table(self.team_tree, headers, rows)
        counts = {k: sum(1 for _, src in rows if src == k) for k in SOURCE_COLOURS}
        people = "   |   ".join(rc.staff_lines(self.result, label))
        self.team_summary_var.set(f"{len(rows)} players: {counts['Both']} in both, {counts['FA only']} FA only, "
                                  f"{counts['Thrive only']} Thrive only" + (f"   |   {people}" if people else ""))

    def save_staff_template(self) -> None:
        path = filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Excel workbook", "*.xlsx")],
                                            initialfile="Managers_template.xlsx")
        if path and self._write(lambda: rc.write_staff_template(path), f"Saved {path}"):
            messagebox.showinfo("Saved", f"Saved the template:\n{path}\n\nFill it in, then choose it as the "
                                         "Managers file in Step 1.")

    def copy_phone(self, kind: str) -> None:
        """Put a team's manager or assistant phone number on the clipboard."""
        label = self.team_var.get()
        if not self._need_result() or not label:
            return
        phone = rc.staff_phones(self.result, label, kind)
        if not phone:
            messagebox.showinfo("No phone number", f"No {kind} phone number for {label} in the managers file. "
                                "Choose a managers file in Step 1 and click Reconcile again.")
            return
        self.clipboard_clear()
        self.clipboard_append(phone)
        self.status_var.set(f"Copied {kind} phone for {label}: {phone}")

    def copy_whatsapp(self) -> None:
        """Show WhatsApp-ready text for the chosen team, to copy and paste."""
        label = self.team_var.get()
        if not self._need_result() or not label:
            return
        if not messagebox.askokcancel("Data protection warning", WHATSAPP_WARNING, icon="warning"):
            return
        medical = self.medical_var.get()
        parts = [(f"Squad {i}" if len(msgs) > 1 else "Squad", m)
                 for msgs in [rc.whatsapp_squad(self.result, label)] for i, m in enumerate(msgs, 1)]
        if medical:
            msgs = rc.whatsapp_medical(self.result, label)
            parts += [(f"Medical {i}" if len(msgs) > 1 else "Medical", m) for i, m in enumerate(msgs, 1)]
        win = tk.Toplevel(self)
        win.title(f"Copy for WhatsApp: {label}")
        win.geometry("620x640")
        ttk.Label(win, style="Hint.TLabel", wraplength=580, justify="left", text=(
            "Pick a tab, click Copy, then paste into WhatsApp. You can edit the text first. Send the squad "
            "message and the medical message separately, and only to the people who need them.")
                  ).pack(anchor="w", padx=10, pady=8)
        nb = ttk.Notebook(win)
        nb.pack(fill="both", expand=True, padx=10)
        boxes = []
        for title, text in parts:
            frame = ttk.Frame(nb)
            box = tk.Text(frame, wrap="word", font=FONT, undo=True)
            box.insert("1.0", text)
            box.pack(fill="both", expand=True)
            nb.add(frame, text=f"  {title}  ")
            boxes.append(box)

        def copy() -> None:
            self.clipboard_clear()
            self.clipboard_append(boxes[nb.index("current")].get("1.0", "end").strip())
            self.status_var.set("Copied. Paste it into WhatsApp.")

        row = ttk.Frame(win)
        row.pack(fill="x", padx=10, pady=8)
        ttk.Button(row, text="Copy to clipboard", style="Accent.TButton", command=copy).pack(side="left")
        ttk.Button(row, text="Close", command=win.destroy).pack(side="right")
        if not medical:
            ttk.Label(row, text="  Medical message left out (tickbox is off).", style="Hint.TLabel").pack(side="left")

    def _medical_changed(self) -> None:
        self.cfg["medical"] = bool(self.medical_var.get())
        self._persist()
        self._fill_team_tab()

    # ------------------------------------------------------------------ exports
    def _need_result(self) -> bool:
        if not self.result:
            messagebox.showinfo("Nothing to export yet", "Choose your files and click Reconcile first.")
        return bool(self.result)

    def _confirm_export(self, includes_medical: bool) -> bool:
        """Show the data protection warning every time, before anything is written."""
        return messagebox.askokcancel("Data protection warning", export_warning(includes_medical),
                                      icon="warning")

    def _save_as(self, name: str) -> str:
        return filedialog.asksaveasfilename(defaultextension=".xlsx", filetypes=[("Excel workbook", "*.xlsx")],
                                            initialfile=f"{name}_{date.today():%Y-%m-%d}.xlsx")

    def _write(self, action, done: str) -> bool:
        try:
            action()
        except OSError as exc:
            messagebox.showerror("Could not save", f"The file could not be saved. Is it open in Excel?\n\n{exc}")
            return False
        self.status_var.set(done)
        return True

    def export(self) -> None:
        """Full workbook: every view, not paying, one sheet per team, mapping."""
        if not self._need_result() or not self._confirm_export(self.medical_var.get()):
            return
        path = self._save_as("Player_Reconciliation")
        if path and self._write(lambda: rc.export_xlsx(path, self.result, self.team_map, self.fa_var.get(),
                                                        self.thrive_var.get(), self.medical_var.get()),
                                f"Saved {path}"):
            messagebox.showinfo("Saved", f"Saved the full workbook:\n{path}")

    def export_team(self) -> None:
        label = self.team_var.get()
        if not self._need_result() or not label or not self._confirm_export(self.medical_var.get()):
            return
        safe = "".join(ch for ch in label if ch.isalnum() or ch in " -").strip().replace(" ", "_")
        path = self._save_as("Team_" + safe)
        if path and self._write(lambda: rc.export_team_xlsx(path, self.result, label, self.medical_var.get()),
                                f"Saved {path}"):
            messagebox.showinfo("Saved", f"Saved {label}:\n{path}")

    def export_each_team(self) -> None:
        """One file per team in a dated sub-folder, ready to send to managers."""
        if not self._need_result() or not self._confirm_export(self.medical_var.get()):
            return
        folder = filedialog.askdirectory(title="Choose where to save the team files")
        if not folder:
            return
        target = os.path.join(folder, f"Team files {date.today():%Y-%m-%d}")
        done = []

        def action():
            os.makedirs(target, exist_ok=True)
            done.extend(rc.export_each_team(target, self.result, self.medical_var.get()))
        if self._write(action, f"Saved {len(rc.team_labels(self.result))} team files to {target}"):
            if messagebox.askyesno("Team files saved",
                                   f"Saved {len(done)} team files (one per team) in:\n{target}\n\n"
                                   "Open the folder now?"):
                open_folder(target)

    def export_not_paying(self) -> None:
        if not self._need_result() or not self._confirm_export(False):
            return
        path = self._save_as("Not_Paying")
        if path and self._write(lambda: rc.export_not_paying_xlsx(path, self.result), f"Saved {path}"):
            messagebox.showinfo("Saved", f"Saved the not-paying list:\n{path}")

    # ------------------------------------------------------------------ team mappings
    def _thrive_team_counts(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for p in self.thrive_players or []:
            for t in p.teams:
                counts[t] = counts.get(t, 0) + 1
        return counts

    def _fa_teams(self):
        teams = {t for p in (self.fa_players or []) for t in p.teams}
        teams.update(v for v in self.team_map.values() if v)
        return sorted(teams)

    def _unmapped_teams(self):
        known = {rc._tkey(k) for k in self.team_map}
        return sorted(t for t in self._thrive_team_counts() if rc._tkey(t) not in known)

    def _refresh_mapping_table(self) -> None:
        counts = self._thrive_team_counts()
        self.map_tree.delete(*self.map_tree.get_children())
        known = {rc._tkey(k): k for k in self.team_map}
        for name in sorted(set(self.team_map) | set(counts), key=str.lower):
            key = known.get(rc._tkey(name))
            if key is None:
                fa, tag = UNMAPPED_LABEL, "unmapped"
            elif self.team_map[key] is rc.IGNORE:
                fa, tag = IGNORE_LABEL, "ignored"
            else:
                fa, tag = self.team_map[key], ""
            self.map_tree.insert("", "end", iid=name, values=(name, fa, counts.get(name, "")), tags=(tag,))
        self.target_box["values"] = [IGNORE_LABEL] + self._fa_teams()
        missing = self._unmapped_teams()
        self.map_warn_var.set(f"{len(missing)} Thrive team(s) need a decision (red rows): {', '.join(missing)}"
                              if missing else "")

    def _on_map_select(self, _event=None) -> None:
        sel = self.map_tree.selection()
        if sel:
            self.sel_var.set(sel[0])
            current = self.map_tree.item(sel[0], "values")[1]
            self.target_var.set(current if current != UNMAPPED_LABEL else "")

    def _mapping_changed(self) -> None:
        self._persist()
        self._recompute()
        self._refresh_mapping_table()

    def _apply_mapping(self) -> None:
        name, target = self.sel_var.get(), self.target_var.get()
        if not name or not target:
            messagebox.showinfo("Team mappings", "Click a row in the list, then choose its FA team.")
            return
        for key in [k for k in self.team_map if rc._tkey(k) == rc._tkey(name)]:
            del self.team_map[key]
        self.team_map[name] = rc.IGNORE if target == IGNORE_LABEL else target
        self._mapping_changed()

    def _remove_mapping(self) -> None:
        name = self.sel_var.get()
        for key in [k for k in self.team_map if rc._tkey(k) == rc._tkey(name)]:
            del self.team_map[key]
        self.sel_var.set("")
        self._mapping_changed()

    def _add_mapping(self) -> None:
        name = self.new_var.get().strip()
        if name and rc._tkey(name) not in {rc._tkey(k) for k in self.team_map}:
            self.team_map[name] = rc.IGNORE
            self.new_var.set("")
            self._persist()
            self._refresh_mapping_table()
            self.map_tree.selection_set(name)
            self.status_var.set(f"Added '{name}' as (ignore). Choose its FA team and click Apply.")

    def _suggest_unmapped(self, quiet: bool = False) -> int:
        missing = self._unmapped_teams()
        found = rc.suggest_mapping(missing, self._fa_teams())
        self.team_map.update(found)
        if found:
            self._mapping_changed()
        if not quiet:
            self.status_var.set(f"Suggested {len(found)} mapping(s). {len(missing) - len(found)} still need choosing.")
        return len(found)

    def _reset_mapping(self) -> None:
        if messagebox.askyesno("Reset", "Replace your team mappings with the built-in defaults?"):
            self.team_map = dict(rc.DEFAULT_TEAM_MAP)
            self._mapping_changed()

    def _persist(self) -> None:
        self.cfg["team_map"] = self.team_map
        save_config(self.cfg)


def self_test() -> int:
    """Headless check used by the build pipeline: the bundled exe starts and can read and write Excel."""
    import tempfile
    result = rc.reconcile([], [], rc.DEFAULT_TEAM_MAP)
    with tempfile.TemporaryDirectory() as folder:
        rc.export_xlsx(os.path.join(folder, "selftest.xlsx"), result, rc.DEFAULT_TEAM_MAP)
        template = os.path.join(folder, "managers.xlsx")
        rc.write_staff_template(template)
        if not rc.load_staff(template):
            return 1
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    App().mainloop()
