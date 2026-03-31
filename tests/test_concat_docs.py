import subprocess
import sys
from pathlib import Path
import tempfile


def test_concat_docs_basic():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        docs = tmp / "docs"
        docs.mkdir()
        (docs / "a.md").write_text("# A\n\nContent A\n")
        (docs / "sub").mkdir()
        (docs / "sub" / "b.md").write_text("---\ntitle: B\n---\n\nContent B\n")

        out = docs / "combined.md"
        # call the script
        subprocess.check_call([sys.executable, "scripts/concat_docs.py", "--docs", str(docs), "--output", str(out), "--include-filenames", "--strip-frontmatter"]) 

        txt = out.read_text()
        assert "# Combined docs" in txt
        assert "## File: a.md" in txt
        assert "Content A" in txt
        assert "## File: sub/b.md" in txt
        assert "Content B" in txt
