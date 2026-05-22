import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_embed_consistency.js"


@pytest.mark.skipif(os.environ.get("EMBED_CONSISTENCY_STRICT") != "1", reason="Enable by setting EMBED_CONSISTENCY_STRICT=1")
def test_embed_consistency():
    repo_root = Path(__file__).resolve().parents[1]
    proc = subprocess.run(
        ["node", str(SCRIPT)],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        assert proc.returncode == 0
    else:
        print(proc.stdout)
        print(proc.stderr)
        pytest.fail("Embed consistency check failed")
