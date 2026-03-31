import sys
from pathlib import Path
import shutil
import subprocess
import os
import tempfile
import importlib.util

import pytest

# Add script location to path
SKILL_SCRIPTS = Path(__file__).resolve().parents[1] / ".github/skills/llm-documentation-protocol/scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from validate_docs import validate_workflow_doc, validate_file_doc, main as validate_main


def write_file(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def test_validate_workflow_and_file_docs(tmp_path):
    # Create temp repo structure
    repo = tmp_path
    docs = repo / "docs"
    workflows = docs / "workflows"
    files = docs / "files"

    # Create a valid workflow doc
    wf = workflows / "WF-test.md"
    wf.parent.mkdir(parents=True, exist_ok=True)
    wf.write_text("""---
kind: workflow
id: WF-test
owner: test
status: active
trigger: manual
inputs: []
outputs: []
entrypoints: []
files: [src/example.py]
last_reviewed: 2026-01-17
---

# WF: Test
""")

    # Create a valid file doc
    fd = files / "src/example.py.md"
    fd.parent.mkdir(parents=True, exist_ok=True)
    fd.write_text("""---
kind: file
path: src/example.py
role: Example
workflows: [WF-test]
inputs: []
outputs: []
interfaces: []
stability: experimental
owner: test
safe_to_delete_when: Unknown
superseded_by: null
last_reviewed: 2026-01-17
---

# File: src/example.py
""")

    # Create an INDEX.md referencing the workflow
    (docs / "INDEX.md").write_text("""# Documentation Index

## Workflows
- [WF-test](workflows/WF-test.md): Test workflow
""")

    # Set environment so script picks up the temp repo path
    os.environ["REPO_ROOT_OVERRIDE"] = str(repo)

    # Run validation CLI via subprocess to emulate CI
    script = SKILL_SCRIPTS / "validate_docs.py"
    proc = subprocess.run([sys.executable, str(script)], cwd=str(repo))
    assert proc.returncode == 0, f"validate_docs failed: exit {proc.returncode}"


def test_validate_workflow_doc_function(tmp_path):
    wf = tmp_path / "WF-sample.md"
    wf.write_text("""---
kind: workflow
id: WF-sample
owner: X
status: experimental
trigger: manual
inputs: []
outputs: []
entrypoints: []
files: []
last_reviewed: 2026-01-17
---
""")
    errs = validate_workflow_doc(wf)
    assert errs == []


def test_validate_file_doc_function(tmp_path):
    fd = tmp_path / "src_file.md"
    fd.write_text("""---
kind: file
path: src/foo.py
last_reviewed: 2026-01-17
---
""")
    errs = validate_file_doc(fd)
    assert errs == []
