import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "archive_investment_data",
    ROOT / "scripts/archive_investment_data.py",
)
ARCHIVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ARCHIVER)


class ArchiveInvestmentDataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.inbox = self.root / "inbox"
        self.inbox.mkdir()
        self.data_root = self.root / "data"

    def tearDown(self):
        self.temp.cleanup()

    def test_archives_files_and_writes_hash_manifest_without_clearing_inbox(self):
        source = self.inbox / "export.csv"
        source.write_text("value\n42\n", encoding="utf-8")

        with patch.object(ARCHIVER, "INBOX", self.inbox), patch.object(
            ARCHIVER, "DATA_ROOT", self.data_root
        ):
            ARCHIVER.archive("2026-11")

        archived = self.data_root / "versions/2026-11/raw/export.csv"
        manifest = json.loads(
            (self.data_root / "versions/2026-11/manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(archived.read_bytes(), source.read_bytes())
        self.assertEqual(manifest["files"]["export.csv"]["size_bytes"], source.stat().st_size)
        self.assertEqual(len(manifest["files"]["export.csv"]["sha256"]), 64)
        self.assertEqual(manifest["metadata"]["export_date"], None)
        self.assertTrue((archived.parent / ".gitignore").is_file())
        self.assertTrue((archived.parent.parent / ".gitignore").is_file())
        self.assertTrue(source.exists())

    def test_does_not_overwrite_different_file_with_same_name(self):
        source = self.inbox / "export.csv"
        source.write_text("new", encoding="utf-8")
        raw_dir = self.data_root / "versions/2026-11/raw"
        raw_dir.mkdir(parents=True)
        (raw_dir / "export.csv").write_text("old", encoding="utf-8")

        with patch.object(ARCHIVER, "INBOX", self.inbox), patch.object(
            ARCHIVER, "DATA_ROOT", self.data_root
        ):
            with self.assertRaises(FileExistsError):
                ARCHIVER.archive("2026-11")

        self.assertEqual((raw_dir / "export.csv").read_text(encoding="utf-8"), "old")
        self.assertTrue(source.exists())

    def test_rejects_invalid_version_code(self):
        with self.assertRaisesRegex(ValueError, "YYYY-MM"):
            ARCHIVER.archive("../2026-11", self.inbox)
