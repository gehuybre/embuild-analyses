import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1] / ".github/skills/llm-documentation-protocol/scripts"


def test_generate_workflow_print_only():
    script = SCRIPT_DIR / "generate_workflow_doc.py"
    proc = subprocess.run([sys.executable, str(script), "example-print", "--print-only"], capture_output=True, text=True)
    assert proc.returncode == 0
    assert "id: WF-example-print" in proc.stdout or "WF-example-print" in proc.stdout


def test_generate_file_print_only():
    script = SCRIPT_DIR / "generate_file_doc.py"
    proc = subprocess.run([sys.executable, str(script), "src/foo.py", "--print-only"], capture_output=True, text=True)
    assert proc.returncode == 0
    assert "path: src/foo.py" in proc.stdout
