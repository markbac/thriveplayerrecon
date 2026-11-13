"""The web app's version must match src/version.py (the build date is stamped at build time)."""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

import version  # noqa: E402


def test_web_version_matches_python():
    with open(os.path.join(ROOT, "web", "src", "reconcile_core.ts"), encoding="utf-8") as fh:
        ts = fh.read()
    assert re.search(r"export const VERSION = '([^']*)'", ts).group(1) == version.__version__
