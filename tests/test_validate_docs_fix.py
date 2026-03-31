import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / ".github/skills/llm-documentation-protocol/scripts/validate_docs.py"


def test_fix_adds_last_reviewed(tmp_path):
    repo = tmp_path
    docs = repo / "docs"
    workflows = docs / "workflows"
    workflows.mkdir(parents=True)

    wf = workflows / "WF-fix-test.md"
    wf.write_text("""---
kind: workflow
id: WF-fix-test
owner: test
status: active
trigger: manual
inputs: []
outputs: []
entrypoints: []
files: []
---

# WF: Fix Test
""")
    (docs / "INDEX.md").write_text("""# Documentation Index

## Workflows
- [WF-fix-test](workflows/WF-fix-test.md): Fix test
""")

    env = os.environ.copy()
    env["REPO_ROOT_OVERRIDE"] = str(repo)
    proc = subprocess.run([sys.executable, str(SCRIPT), "--check-paths", "--fix"], cwd=str(repo), env=env, capture_output=True, text=True)
    # The script may return non-zero if there are other unrelated issues; ensure the fix was applied
    content = wf.read_text()
    assert 'last_reviewed' in content
    checklist = docs / "VALIDATION_CHECKLIST.md"
    assert checklist.exists(), "Checklist should be generated after fixes"




def test_scaffold_creates_front_matter(tmp_path):
    repo = tmp_path
    docs = repo / "docs"
    files = docs / "files"
    files.mkdir(parents=True)

    fd = files / "src/cli/newfile.py.md"
    fd.parent.mkdir(parents=True, exist_ok=True)
    fd.write_text("""# File: src/cli/newfile.py

No front matter yet.
""")

    env = os.environ.copy()
    env["REPO_ROOT_OVERRIDE"] = str(repo)
    proc = subprocess.run([sys.executable, str(SCRIPT), "--scaffold"], cwd=str(repo), env=env, capture_output=True, text=True)
    # scaffold should apply; ensure front matter now exists and checklist generated
    content = fd.read_text()
    assert content.startswith('---')
    assert 'last_reviewed' in content
    checklist = docs / "VALIDATION_CHECKLIST.md"
    assert checklist.exists(), "Checklist should be generated after scaffolding"

