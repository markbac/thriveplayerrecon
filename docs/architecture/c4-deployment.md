# Deployment and pipeline

## Where the tool runs

The exe runs on the administrator's own Windows PC. Nothing is installed and no server is involved.

```mermaid
C4Deployment
  title Deployment of Thrive Player Recon

  Deployment_Node(pc, "Administrator's PC", "Windows 10 or 11") {
    Deployment_Node(exe, "PlayerReconcile exe", "PyInstaller one-file bundle") {
      Container(app, "Thrive Player Recon", "Python 3.12, tkinter, openpyxl", "GUI and reconciliation engine")
    }
    Deployment_Node(profile, "User profile", "APPDATA folder") {
      ContainerDb(cfg, "config.json", "JSON", "Settings only, no player data")
    }
    Deployment_Node(docs, "Documents and Downloads", "Local folders") {
      ContainerDb(files, "Excel files", "xlsx", "Exports in, reports out")
    }
  }

  Rel(app, cfg, "Reads and writes")
  Rel(app, files, "Reads and writes")
```

## Build and release pipeline

GitHub Actions builds the exe and publishes releases. The workflow is `.github/workflows/build-release.yml`.

```mermaid
flowchart TD
  dev["Developer pushes a change"] --> trig{"What was pushed?"}
  trig -->|"Pull request or push to main"| build
  trig -->|"Tag starting with v"| build
  trig -->|"Manual run"| build

  subgraph build["Job: build on a Windows runner"]
    b1["Check out and set up Python 3.12"] --> b2["Install requirements-build.txt"]
    b2 --> b3["Read version from src/version.py"]
    b3 --> b4{"Is this a tag?"}
    b4 -->|"Yes"| b5["Tag must equal v plus the version"]
    b4 -->|"No"| b6
    b5 --> b6["Build exe with PyInstaller"]
    b6 --> b7["Smoke test: run the exe with --self-test"]
    b7 --> b8["Write SHA256SUMS.txt"]
    b8 --> b9["Upload the exe as a build artifact"]
  end

  build --> rel{"Is this a tag?"}
  rel -->|"No"| done["Artifact kept for 30 days"]
  rel -->|"Yes"| release

  subgraph release["Job: release on an Ubuntu runner"]
    r1["Download the artifact"] --> r2["Take release notes from CHANGELOG.md"]
    r2 --> r3["gh release create with exe and checksums"]
  end

  release --> pub["GitHub release page"]
  pub --> user["Administrator downloads and runs the exe"]
```

## Pipeline design

| Aspect | Choice |
| --- | --- |
| Triggers | Pull requests and pushes to `main` that touch the app, scripts, requirements or the workflow. Version tags. Manual runs |
| Release | Only on tags starting with `v`. The tag must equal `v` plus the version in `src/version.py`, otherwise the build fails |
| Permissions | Read-only by default. Only the release job has `contents: write` |
| Dependencies | Only GitHub's own actions (checkout, setup-python, upload and download artifact) and the `gh` command line. No third-party actions |
| Notes | The release notes are the matching section of `CHANGELOG.md` |
| Integrity | `SHA256SUMS.txt` is published with the exe |
| Check | The built exe is started with `--self-test`, which proves it launches and can write Excel. This is a smoke check, not a test suite |
| Signing | Not signed. See [decisions](decisions.md) |

The release steps for a maintainer are in [../development.md](../development.md#releasing).
