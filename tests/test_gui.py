"""The desktop app driven end to end: reconcile through the GUI, then check what each tab shows.
Skipped where there is no display."""
from conftest import THRIVE_HEADERS, reconcile_in_app, write_thrive


def _rows(tree):
    return [tree.item(i, "values") for i in tree.get_children()]


def _headings(tree):
    return [tree.heading(c, "text").rstrip(" ▲▼") for c in tree["columns"]]


def test_not_reconciled_notice_then_results(app_factory, fa_path, thrive_path):
    a = app_factory()
    a.update()
    # one notice per results table, placed over it (only the visible tab's notice is drawn)
    assert len(a.placeholders) == 4 and all(p.winfo_manager() == "place" for p in a.placeholders)
    assert a.run_state_var.get() == "Not run yet"
    reconcile_in_app(a, fa_path, thrive_path)
    assert all(not p.winfo_manager() for p in a.placeholders)
    assert a.run_state_var.get().startswith("Last run")
    a.fa_var.set(fa_path + "x")
    assert "Files changed" in a.run_state_var.get()


def test_team_sheet_navigation_and_not_paying_rows(app_factory, fa_path, thrive_path):
    a = app_factory()
    reconcile_in_app(a, fa_path, thrive_path)
    a.nb.select(a.team_tab)
    labels = list(a.team_box["values"])
    a.team_var.set(labels[-1]); a._fill_team_tab()
    a._step_team(1)
    assert a.team_var.get() == labels[0] and a.team_pos_var.get() == f"1 of {len(labels)}"
    a.team_var.set("U11 White"); a._fill_team_tab(); a.update()
    t = a.team_tree
    heads = _headings(t)
    assert heads[:2] == ["Player", "Paying"]
    unpaid = [t.item(i, "values")[0] for i in t.get_children() if "unpaid" in t.item(i, "tags")]
    assert unpaid == ["Ben Bold"]
    assert "1 not paying" in a.team_unpaid_var.get()
    a.team_unpaid_only.set(True); a._render_table(t)
    assert [v[0] for v in _rows(t)] == ["Ben Bold"]


def test_search_sort_and_details(app_factory, fa_path, thrive_path):
    a = app_factory()
    reconcile_in_app(a, fa_path, thrive_path)
    a.team_var.set("U11 White"); a._fill_team_tab()
    t = a.team_tree
    a.team_search_var.set("bold"); a.update()
    assert [v[0] for v in _rows(t)] == ["Ben Bold"]
    a.team_search_var.set("")
    a._sort_table(t, 0); a._sort_table(t, 0)
    names = [v[0] for v in _rows(t)]
    assert names == sorted(names, key=str.lower, reverse=True)
    t.selection_set(t.get_children()[0]); a._team_detail(); a.update()
    assert any(w.winfo_class() == "Toplevel" for w in a.winfo_children())


def test_not_paying_and_consents_tabs(app_factory, fa_path, thrive_path):
    a = app_factory()
    reconcile_in_app(a, fa_path, thrive_path)
    assert {v[0] for v in _rows(a.np_tree)} == {"Ben Bold", "Dan Dee", "Tia Tiny"}
    assert "(3)" in a.nb.tab(a.np_tab, "text")
    assert [v[0] for v in _rows(a.cons_tree)] == ["Ben Bold", "Cal Cole"]
    assert "(2)" in a.nb.tab(a.cons_tab, "text")
    assert a.cons_checked_var.get() == ""


def test_missing_thrive_columns_are_explained(app_factory, fa_path, tmp_path):
    headers = [h for h in THRIVE_HEADERS if h not in ("Active mandates", "Club rules")]
    a = app_factory()
    reconcile_in_app(a, fa_path, write_thrive(tmp_path / "partial.xlsx", headers))
    warnings = [d for d in a.dialogs if d[0] == "showwarning"]
    assert warnings and "Active pre-authorisation" in warnings[-1][1][1]
    assert "Mandates could not be checked" in a.np_warn_var.get()
    assert "Club rules" in a.cons_checked_var.get()
    a.team_var.set("U11 White"); a._fill_team_tab()
    assert all(v[1] == "? Unknown (no mandate column)" for v in _rows(a.team_tree))


def test_everything_fits_at_minimum_size(app_factory, fa_path, thrive_path):
    a = app_factory()
    reconcile_in_app(a, fa_path, thrive_path)
    checked = ("TButton", "TLabel", "TCombobox", "TCheckbutton", "TEntry", "Treeview", "Label")

    def walk(w):
        yield w
        for c in w.winfo_children():
            yield from walk(c)

    a.geometry("960x620+0+0")
    for tab in a.nb.tabs():
        a.nb.select(tab)
        a.update()
        width, height = a.winfo_width(), a.winfo_height()
        for w in walk(a):
            if w.winfo_class() not in checked or not w.winfo_ismapped() or w.winfo_toplevel() is not a:
                continue
            x, y = w.winfo_rootx() - a.winfo_rootx(), w.winfo_rooty() - a.winfo_rooty()
            assert x + w.winfo_width() <= width + 1 and y + w.winfo_height() <= height + 1, w
            if w.winfo_class() in ("TButton", "TCombobox"):
                assert w.winfo_width() >= w.winfo_reqwidth() - 2, f"{w} squashed on {a.nb.tab(tab, 'text')}"


def test_saved_size_bigger_than_screen_is_shrunk(app_factory):
    a = app_factory()
    a.cfg["geometry"] = f"{a.winfo_screenwidth() + 500}x700+0+0"
    a._restore_window(); a.update()
    assert a.winfo_width() <= a.winfo_screenwidth()


def test_settings_remembered(app_factory, fa_path, thrive_path):
    a = app_factory()
    reconcile_in_app(a, fa_path, thrive_path)
    # a size that fits a 1024x768 screen (CI runners), since a bigger saved size is shrunk to the screen
    a.geometry("1000x660+10+10"); a.update()
    a.nb.select(a.np_tab)
    a.team_var.set("U12 Black"); a._fill_team_tab()
    a._on_close()
    b = app_factory()
    b.update()
    assert (b.winfo_width(), b.winfo_height()) == (1000, 660)
    assert b.nb.select() == str(b.np_tab)
    reconcile_in_app(b, fa_path, thrive_path)
    assert b.team_choices[b.team_var.get()] == "U12 Black"


def test_unpaid_counts_and_send_to_manager_on_whatsapp(app_factory, fa_path, thrive_path, tmp_path, monkeypatch):
    import app as appmod
    opened = []
    monkeypatch.setattr(appmod.webbrowser, "open", lambda url, *a, **k: opened.append(url))
    staff = tmp_path / "managers.csv"
    staff.write_text("Name,Role,Team(s),Phone\nAlex Example,Manager,U12 Black,07700 900010\n", encoding="utf-8")
    a = app_factory()
    reconcile_in_app(a, fa_path, thrive_path, staff=str(staff))
    values = list(a.team_box["values"])
    assert "U12 Black (Alex Example) — 1 not paying" in values
    assert "U11 White — 1 not paying" in values
    a.team_var.set("U12 Black (Alex Example) — 1 not paying"); a._fill_team_tab()
    before = set(a.winfo_children())
    a.copy_whatsapp()
    win = next(w for w in a.winfo_children() if w not in before)

    def walk(w):
        yield w
        for c in w.winfo_children():
            yield from walk(c)

    send = [w for w in walk(win) if w.winfo_class() == "TButton" and "Send to Alex Example" in str(w.cget("text"))]
    assert len(send) == 1
    send[0].invoke()
    assert opened and opened[0].startswith("https://wa.me/447700900010?text=")
    win.destroy()
