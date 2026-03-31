import os
import subprocess
import sys
from pathlib import Path
import pytest

SCRIPT = Path(__file__).resolve().parents[1] / ".github/skills/llm-documentation-protocol/scripts/check_docs_coverage.py"


@pytest.mark.skipif(os.environ.get("DOCS_COVERAGE_STRICT") != "1", reason="Enable by setting DOCS_COVERAGE_STRICT=1")
def test_docs_coverage_all_files_have_docs():
    """Run the coverage check over the real repo and fail if any missing docs."""
    repo_root = Path(__file__).resolve().parents[1]
    proc = subprocess.run([sys.executable, str(SCRIPT), "--print-only"], cwd=str(repo_root), capture_output=True, text=True)
    # Return code 0 means no missing docs
    if proc.returncode == 0:
        assert proc.returncode == 0
    else:
        # Print stdout for debugging and fail
        print(proc.stdout)
        print(proc.stderr)
        pytest.fail("Documentation coverage check failed — missing docs listed above")
