import importlib.util
import json
import tempfile
import unittest
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "apps/prijsherziening-index-i-2021"
SPEC = importlib.util.spec_from_file_location("materials", APP / "scripts/export_revtool_materials.py")
MATERIALS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MATERIALS)

MANIFEST = {"source": "revtool-nl-versie-2026-07-10.xlsm", "sha256": "fixture"}


def row(**changes):
    return {
        "sheet": "Materiaalindexen o.w.", "table": "AnyTableName",
        "series": "OW 462 - cement - klasse 32,5", "date": "2026-05-01",
        "value": "106.18", "status": "numeric", "cell": "BY133", **changes,
    }


def grymafer():
    return row(sheet="Grymafer indexen", table="Grymafer_maand",
               series="RSR - beton staven", value="649", date="2026-04-01")


class MaterialExportTests(unittest.TestCase):
    def test_filters_unsupported_periods_weekly_wages_missing_and_future(self):
        result = MATERIALS.build_materials([
            row(), grymafer(),
            row(date="2023-11-01"),
            row(date="2026-06-01", status="missing", value=""),
            row(date="2026-08-01"),
            row(sheet="Indexeringen Lonen per PC"),
            row(sheet="Grymafer indexen", table="Grymafer_week"),
        ], MANIFEST)
        self.assertEqual([r["id"] for r in result["series"]], ["grymafer:RSR", "ow:462"])
        self.assertEqual(result["series"][1]["observations"], [
            {"date": "2026-05-01", "value": 106.18, "cell": "BY133"},
        ])
        self.assertEqual(result["skipped_observations"],
                         {"outside_supported_period": 2, "missing": 1})

    def test_rejects_duplicates_bad_dates_values_and_unknown_versions(self):
        for extra in [
            row(), row(date="2026-05-02"), row(date="2026-13-01"),
            row(date="2026-06-01", value="NaN"),
            row(date="2026-06-01", value="0"),
            row(date="2026-06-01", value="-1"),
        ]:
            with self.assertRaises(ValueError):
                MATERIALS.build_materials([row(), grymafer(), extra], MANIFEST)
        with self.assertRaisesRegex(ValueError, "dated"):
            MATERIALS.build_materials([row(), grymafer()], {**MANIFEST, "source": "unknown.xlsm"})
        with self.assertRaisesRegex(ValueError, "Expected both"):
            MATERIALS.build_materials([row()], MANIFEST)

    def test_modified_extraction_csv_cannot_be_published(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "manifest.json").write_text(json.dumps({
                **MANIFEST, "artifacts": [{"file": "index_series.csv", "sha256": sha256(b"original").hexdigest()}],
            }))
            (root / "index_series.csv").write_text("modified")
            with self.assertRaisesRegex(ValueError, "no longer matches"):
                MATERIALS.export(root, root / "public.json")
            self.assertFalse((root / "public.json").exists())

    def test_published_snapshot_has_monthly_unique_positive_cells_and_no_future_values(self):
        payload = json.loads((APP / "public/data/revtool_materials.json").read_text())
        self.assertEqual(len(payload["source_sha256"]), 64)
        self.assertEqual(len(payload["extraction_sha256"]), 64)
        ids = [s["id"] for s in payload["series"]]
        self.assertEqual(len(ids), len(set(ids)))
        for series in payload["series"]:
            self.assertTrue(series["source_url"].startswith("https://"))
            dates = [r["date"] for r in series["observations"]]
            self.assertEqual(len(dates), len(set(dates)))
            self.assertEqual(dates, sorted(dates))
            for item in series["observations"]:
                self.assertTrue(item["date"].endswith("-01"))
                self.assertLessEqual(item["date"], payload["snapshot_date"])
                self.assertGreater(item["value"], 0)
                self.assertTrue(item["cell"])
                if series["id"].startswith("ow:"):
                    self.assertGreaterEqual(item["date"], MATERIALS.OW_START)

    def test_decimal_authority_reproduces_standard_and_private_excel_results(self):
        def rounded(value):
            return value.quantize(Decimal("0.00001"), rounding=ROUND_HALF_UP)

        def change(initial, revision):
            return rounded(Decimal(revision) / Decimal(initial) - 1)

        labor = change("37.652", "38.427")
        standard = rounded(1 + Decimal(".4") * labor + Decimal(".4") * change("142.6", "153.73"))
        self.assertEqual(standard, Decimal("1.03945"))
        basket = [
            (".5", "103.9", "111.38"), (".1", "100", "111.54"),
            (".2", "101.74", "106.18"), (".2", "104.41", "107.99"),
        ]
        custom = rounded(1 + Decimal(".4") * labor + Decimal(".4") * sum(
            Decimal(weight) * change(initial, revision) for weight, initial, revision in basket
        ))
        self.assertEqual(custom, Decimal("1.03348"))


if __name__ == "__main__":
    unittest.main()
