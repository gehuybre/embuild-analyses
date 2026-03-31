import os
import subprocess
import sys
from pathlib import Path

def test_skip_data_files_in_check(tmp_path, monkeypatch):
    # Prepare a minimal repo
    repo = tmp_path
    docs = repo / "docs"
    workflows = docs / "workflows"
    files = docs / "files"
    workflows.mkdir(parents=True)
    files.mkdir(parents=True)

    # Create workflow that references a CSV data file which does not exist
    wf = workflows / "WF-data-check.md"
    wf.write_text("""---
kind: workflow
id: WF-data-check
owner: test
status: active
trigger: manual
inputs: []
outputs: []
entrypoints: []
files: [embuild-analyses/analyses/example/data/missing.csv]
last_reviewed: 2026-01-17
---

# WF: Data Check
""")

    # Create an INDEX referencing it so validator doesn't fail for INDEX missing
    (docs / "INDEX.md").write_text("""# Documentation Index

## Workflows
- [WF-data-check](workflows/WF-data-check.md): Test data skip
""")

    # Run validator with REPO_ROOT_OVERRIDE
    script = Path(__file__).resolve().parents[1] / ".github/skills/llm-documentation-protocol/scripts/validate_docs.py"
    env = os.environ.copy()
    env["REPO_ROOT_OVERRIDE"] = str(repo)
    proc = subprocess.run([sys.executable, str(script), "--check-paths"], cwd=str(repo), env=env, capture_output=True, text=True)

    # No warnings should be emitted for the missing CSV (exit code 0)
    assert proc.returncode == 0, f"Expected 0 exit code, got {proc.returncode}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
