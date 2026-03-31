import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / ".github/skills/llm-documentation-protocol/scripts/validate_docs.py"


def test_checklist_generated(tmp_path, monkeypatch):
    repo = tmp_path
    docs = repo / "docs"
    workflows = docs / "workflows"
    workflows.mkdir(parents=True)

    # Create workflow with missing last_reviewed key
    wf = workflows / "WF-test.md"
    wf.write_text("""---
kind: workflow
id: WF-test
owner: test
status: active
trigger: manual
inputs: []
outputs: []
entrypoints: []
files: []
---

# WF: Test
""")

    # Create INDEX referencing it so validator doesn't fail for INDEX missing
    (docs / "INDEX.md").write_text("""# Documentation Index

## Workflows
- [WF-test](workflows/WF-test.md): Test workflow
""")

    # Run validator
    env = os.environ.copy()
    env["REPO_ROOT_OVERRIDE"] = str(repo)
    proc = subprocess.run([sys.executable, str(SCRIPT), "--check-paths"], cwd=str(repo), env=env, capture_output=True, text=True)

    # Script may return non-zero because errors are expected (missing last_reviewed).
    # We only assert that the checklist file was created with actionable items.
    checklist = docs / "VALIDATION_CHECKLIST.md"
    assert checklist.exists(), "Checklist file should be created"
    text = checklist.read_text()
    assert "Validation Checklist" in text
    # since workflow is missing last_reviewed we expect an actionable item
    assert "Add `last_reviewed" in text or "Add YAML front matter" in text
