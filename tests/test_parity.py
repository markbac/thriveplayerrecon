"""Check that the Python engine produces the exact results recorded in tests/parity/expected_parity.json."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from generate_parity import build_parity_data  # noqa: E402


def test_python_matches_shared_parity_snapshot():
    expected_path = os.path.join(ROOT, "tests", "parity", "expected_parity.json")
    with open(expected_path, encoding="utf-8") as fh:
        expected = json.load(fh)
    actual = json.loads(json.dumps(build_parity_data()))
    assert actual == expected
