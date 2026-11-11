# Development

## Layout

```text
src/
  app.py              GUI, menus, help text, exports, self-test entry point
  reconcile_core.py   matching, data quality, reports, Excel export (no GUI code)
  version.py          app name and version, the single source of truth
  assets/             club crest and icon
tests/                pytest suite: invented sample exports, engine, exports and the GUI end to end
scripts/build_exe.bat local Windows build
.github/workflows/    build-release.yml
docs/                 guides and architecture
```

## Run from source

Requires Python 3.9 or later on Windows, with tkinter (included in the python.org installer).

```bash
py -m pip install -r requirements.txt
py src/app.py
```

`py src/app.py --self-test` runs a headless check and exits with code 0. The pipeline uses the same flag on the built exe.

## Run the tests

```bash
py -m pip install -r requirements-dev.txt
py -m pytest -q
```

| File | Covers |
| --- | --- |
| `tests/conftest.py` | Invented sample FA and Thrive exports written as real `.xlsx` files, with birth dates relative to the current season, and a GUI fixture that uses a temporary settings file and answers dialogs automatically |
| `test_loading.py` | Reading both files, missing essential and optional Thrive columns, file detection |
| `test_reconcile.py` | Results, views, team membership, no FA groups, paying status, not paying list, unknown mandates, mapping suggestions |
| `test_consents.py` | What counts as consent given, which items are checked, the report and the squad message |
| `test_exports.py` | Team files and the matchday sheet (content and print setup), full workbook, lists, WhatsApp text |
| `test_gui.py` | The app end to end: reconcile, team sheets, search and sort, tabs, missing columns, minimum window size, remembered settings. Skipped when there is no display |

The pipeline runs the suite on every pull request and before every build, so a failing test stops a release. Never use real player data in tests.

## Build locally

```bash
scripts\build_exe.bat
```

The exe is written to `dist\PlayerReconcile-<version>.exe`.

## Conventions

- British English in code comments, documentation and the app
- Keep `reconcile_core.py` free of GUI imports
- Keep logic out of `app.py`. If it does not need a screen, it belongs in the engine
- Reports are built once in the engine and used by both the screen and Excel
- Markdown: ATX headings, `-` for bullets, tagged code blocks, no em dashes. Mermaid labels must not contain semicolons
- Use invented data in examples. Never commit player data

## Common changes

### Read another Thrive field

1. Add an entry to `THRIVE_FIELDS` in `reconcile_core.py` with the heading text to look for
1. Add the value to the relevant report, for example `team_report`, and its header list
1. Update [data-model](architecture/data-model.md) if it is a new kind of field

### Add a results view

1. Add the title and a predicate to `RESULT_TABS` in `reconcile_core.py`. The Excel export picks it up automatically
1. Add the title and a plain-English description to `VIEW_GROUPS` in `app.py`

### Change the default team mapping

Edit `DEFAULT_TEAM_MAP` in `reconcile_core.py`. Users can restore it from the Team mappings tab. A user who has already saved their own mapping keeps it until they reset.

### Add a nickname

Add it to `NICKNAMES` in `reconcile_core.py`.

## Releasing

Releases are made from a tag. The pipeline builds the exe, checks it starts, and publishes it.

1. Decide the new version using [Semantic Versioning](https://semver.org/)
1. Update `__version__` in `src/version.py`
1. In `CHANGELOG.md`, move the `Unreleased` entries under a new heading such as `## [1.1.0] - 2026-12-01`
1. Commit and merge to `main`
1. Tag and push

```bash
git checkout main
git pull
git tag v1.1.0
git push origin v1.1.0
```

The workflow then:

1. Builds on a Windows runner
1. Fails if the tag is not `v` plus the version in `src/version.py`
1. Starts the exe with `--self-test`
1. Publishes a release with the exe, `SHA256SUMS.txt` and the matching `CHANGELOG.md` section as notes

If the workflow fails, fix the cause, delete the tag locally and on GitHub, and tag again.

```bash
git tag -d v1.1.0
git push origin :refs/tags/v1.1.0
```

To try a build without releasing, run the workflow manually from the **Actions** tab or open a pull request. The exe is kept as a build artifact for 30 days.

## Pipeline reference

See [deployment and pipeline](architecture/c4-deployment.md) for the diagram and design notes.

| Setting | Value |
| --- | --- |
| Runner for build | `windows-latest` |
| Runner for release | `ubuntu-latest` |
| Python | 3.12 |
| Permissions | `contents: read`, and `contents: write` for the release job only |
| Third-party actions | None |

## Possible next steps

- Unit tests for the engine, starting with name scoring, pairing and the data quality rules
- Manual match overrides so a confirmed "Check match" stops being flagged
- Code signing for the exe
- A command line front end for scheduled reports
