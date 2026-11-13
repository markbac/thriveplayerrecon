"""The web app's version and build date must match src/version.py."""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

import version  # noqa: E402


def test_web_version_and_build_date_match_python():
    with open(os.path.join(ROOT, "web", "src", "reconcile_core.ts"), encoding="utf-8") as fh:
        ts = fh.read()
    assert re.search(r"export const VERSION = '([^']*)'", ts).group(1) == version.__version__
    assert re.search(r"export const BUILD_DATETIME = '([^']*)'", ts).group(1) == version.BUILD_DATETIME
