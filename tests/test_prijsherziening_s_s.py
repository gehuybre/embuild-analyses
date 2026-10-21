import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

APP = Path(__file__).resolve().parents[1] / "apps/prijsherziening-index-i-2021"
SPEC = importlib.util.spec_from_file_location("s_s_data", APP / "scripts/process_s_s_waarden.py")
PIPELINE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PIPELINE)


def table(day="01/10/2026", regime="offerten vanaf 11/06/2007"):
    return [
        "OMZENDBRIEF nr. 544.901",
        f"Waarden kleine 's' op {day}",
        regime,
        "voor werkgevers die minder dan 10 werklieden tewerkstellen",
        f"20,000 A = 90,00 % s op {day} 38,000 38,200 38,400 38,600",
        "B = 91,00 %",
        "C = 92,00 %",
        "D = 93,00 %",
    ]


class LaborIndexTests(unittest.TestCase):
    def test_preserves_physical_pdf_pages_and_category_values(self):
        lines = table() + ["\f"] + table("01/01/2027")
        data, warnings = PIPELINE.parse_lines(lines)
        self.assertEqual(warnings, [])
        self.assertEqual(data["source_page"].tolist(), [1] * 4 + [2] * 4)
        self.assertEqual(data["category"].tolist(), list("ABCD") * 2)
        self.assertEqual(data["value"].tolist(), [38, 38.2, 38.4, 38.6] * 2)
        self.assertEqual(set(data["regime"]), {PIPELINE.REGIME})

    def test_pdf_to_lines_keeps_form_feeds(self):
        with patch.object(PIPELINE.subprocess, "run") as run:
            run.return_value.stdout = "page one\n\fpage two\n"
            self.assertEqual(PIPELINE.pdf_to_lines(Path("fixture.pdf")), ["page one", "\fpage two", ""])

    def test_extracts_separate_tender_effective_date(self):
        lines = table()
        lines[2] += ' en grote "S" voor de aanbestedingen vanaf 11/10/2026.'
        data, _ = PIPELINE.parse_lines(lines)
        self.assertTrue(data["initial_effective_date"].eq("2026-10-11").all())
        self.assertTrue(data["effective_date"].eq("2026-10-01").all())

    def test_snapshot_is_persistent_and_duplicate_tables_keep_first_page(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(PIPELINE, "PUBLIC_DIR", Path(tmp) / "public"):
            pdf = Path(tmp) / "source.pdf"
            pdf.write_bytes(b"%PDF-test-snapshot")
            with patch.object(PIPELINE, "pdf_to_lines", return_value=table() + ["\f"] + table()):
                data = PIPELINE.parse_pdf(pdf)
            self.assertEqual(len(data), 4)
            self.assertTrue(data["source_page"].eq(1).all())
            self.assertEqual(len(list((Path(tmp) / "public/sources").glob("*.pdf"))), 1)
            snapshot = Path(tmp) / "public" / data.iloc[0]["source_pdf"].removeprefix("/data/")
            self.assertEqual(snapshot.read_bytes(), pdf.read_bytes())

    def test_export_excludes_old_offer_regimes_and_retains_source(self):
        data, _ = PIPELINE.parse_lines(table() + table(regime="offerten vanaf 11/07/1981"))
        data["source_pdf"] = "/data/sources/fixture.pdf"
        with tempfile.TemporaryDirectory() as tmp, patch.object(PIPELINE, "PUBLIC_DIR", Path(tmp)):
            PIPELINE.write_public_data(data)
            exported = json.loads((Path(tmp) / "labor_indices.json").read_text())
        self.assertEqual(len(exported), 4)
        self.assertTrue(all(row["regime"] == PIPELINE.REGIME for row in exported))
        self.assertTrue(all(row["source_page"] == 1 for row in exported))
        self.assertTrue(all(row["source_pdf"] == "/data/sources/fixture.pdf" for row in exported))

    def test_legacy_csv_exports_explicit_null_provenance(self):
        data, _ = PIPELINE.parse_lines(table())
        data = data.drop(columns=["source_pdf", "source_page"])
        with tempfile.TemporaryDirectory() as tmp, patch.object(PIPELINE, "PUBLIC_DIR", Path(tmp)):
            with patch("sys.stderr") as stderr:
                PIPELINE.write_public_data(data)
                self.assertTrue(stderr.write.called)
            exported = json.loads((Path(tmp) / "labor_indices.json").read_text())
        self.assertTrue(all(row["source_pdf"] is None and row["source_page"] is None for row in exported))

    def test_new_values_replace_old_and_keep_their_source(self):
        data, _ = PIPELINE.parse_lines(table())
        data["source_pdf"] = "/data/sources/old.pdf"
        newer = data.copy()
        newer["value"] += 1
        newer["source_pdf"] = "/data/sources/new.pdf"
        merged = PIPELINE.merge(data, newer)
        self.assertEqual(len(merged), 4)
        self.assertEqual(merged["value"].tolist(), newer["value"].tolist())
        self.assertTrue(merged["source_pdf"].eq("/data/sources/new.pdf").all())

    def test_export_rejects_duplicates_and_invalid_values(self):
        data, _ = PIPELINE.parse_lines(table())
        with tempfile.TemporaryDirectory() as tmp, patch.object(PIPELINE, "PUBLIC_DIR", Path(tmp)):
            with self.assertRaisesRegex(ValueError, "Dubbele"):
                PIPELINE.write_public_data(pd.concat([data, data]))
            data.loc[0, "value"] = 0
            with self.assertRaisesRegex(ValueError, "Ongeldige"):
                PIPELINE.write_public_data(data)

    def test_published_values_match_csv_exactly(self):
        csv = pd.read_csv(APP / "data/waarden-S-s.csv")
        expected = csv[csv["regime"] == PIPELINE.REGIME]
        actual = pd.DataFrame(json.loads((APP / "public/data/labor_indices.json").read_text()))
        columns = ["effective_date", "employer_size", "category", "value"]
        self.assertEqual(
            expected[columns].to_dict("records"),
            actual[columns].to_dict("records"),
        )

    def test_published_sources_are_complete_and_resolvable(self):
        rows = json.loads((APP / "public/data/labor_indices.json").read_text())
        for row in rows:
            self.assertTrue(row["initial_effective_date"])
            self.assertGreater(row["source_page"], 0)
            self.assertTrue((APP / "public" / row["source_pdf"].lstrip("/")).is_file())


if __name__ == "__main__":
    unittest.main()
