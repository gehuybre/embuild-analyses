import hashlib
import importlib.util
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import pandas as pd
from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps/gemeentelijke-investeringen-2026-10"
PUBLIC = APP / "public/data"
SPEC = importlib.util.spec_from_file_location("october_data", APP / "scripts/build_october_data.py")
PIPELINE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PIPELINE)


def fixture(report_type="Meerjarenplan"):
    rows = []
    for year in range(2014, 2032 if report_type == "Meerjarenplan" else 2026):
        plan = 2014 + ((year - 2014) // 6) * 6 if report_type == "Meerjarenplan" else year
        for code in PIPELINE.SCOPE:
            rows.append({
                "NIS-code": "11001",
                "Type rapport": report_type,
                "Rapportjaar": plan,
                "Boekjaar": year,
                "Niveau 2": "I.1 Investeringsuitgaven",
                "Niveau 5": f"{code} {PIPELINE.SCOPE[code]}",
                "Alg. rekening": f"REK-test-{code}",
                "Uitgave": 10.25,
            })
    return pd.DataFrame(rows)


class OctoberFilterTests(unittest.TestCase):
    def test_exact_construction_scope_excludes_financial_intangible_movable_and_leasing(self):
        data = fixture()
        extras = pd.DataFrame([
            {**data.iloc[0].to_dict(), "Niveau 5": code, "Alg. rekening": code, "Uitgave": 1000000}
            for code in ("I.1.A.1 Agentschappen", "I.1.A.2 Verenigingen", "I.1.A.3 Welzijn", "I.1.A.4 Andere",
                         "I.1.C Immaterieel", "I.1.B.1.c Roerend", "I.1.B.1.d Leasing", "I.1.B.2.b Roerend")
        ])
        totals, coverage, cells, _ = PIPELINE.filter_construction(pd.concat([data, extras]), "Meerjarenplan")
        self.assertEqual(set(totals), set(range(2014, 2032)))
        self.assertTrue(all(value == 51.25 for value in totals.values()))
        self.assertEqual(len(cells), 90)
        self.assertTrue(all(count == 1 for count in coverage.values()))

    def test_positive_account_convention_and_observed_zero(self):
        data = fixture()
        data.loc[data.Boekjaar == 2014, "Uitgave"] = [100, -25, 0, -10, 5]
        data.loc[data.Boekjaar == 2015, "Uitgave"] = 0
        totals, coverage, _, audit = PIPELINE.filter_construction(data, "Meerjarenplan")
        self.assertEqual(totals[2014], 105)
        self.assertEqual(totals[2015], 0)
        self.assertEqual(coverage[2015], 1)
        self.assertEqual(audit["excluded_non_positive_rows"], 8)
        self.assertEqual(audit["excluded_non_positive_amount"], -35)

    def test_overlapping_and_late_plan_years_do_not_double_count(self):
        data = fixture()
        extras = pd.DataFrame([
            {**data.iloc[0].to_dict(), "Rapportjaar": plan, "Boekjaar": year, "Uitgave": 1000000}
            for plan, year in ((2014, 2020), (2020, 2026), (2020, 2027), (2026, 2032), (2026, 2033))
        ])
        expected, _, _, _ = PIPELINE.filter_construction(data, "Meerjarenplan")
        actual, _, _, _ = PIPELINE.filter_construction(pd.concat([data, extras]), "Meerjarenplan")
        self.assertEqual(actual, expected)

    def test_accounts_use_their_own_year_and_stop_in_2025(self):
        totals, _, _, _ = PIPELINE.filter_construction(fixture("Jaarrekening"), "Jaarrekening")
        self.assertEqual(set(totals), set(range(2014, 2026)))
        self.assertNotIn(2026, totals)

    def test_invalid_data_fails_explicitly(self):
        invalid = [
            fixture().drop(columns="Niveau 5"),
            fixture().assign(Uitgave=float("nan")),
            fixture().assign(Uitgave=float("inf")),
            fixture().assign(Boekjaar=2014.5),
            fixture().assign(**{"NIS-code": "bad"}),
            fixture().query("Boekjaar != 2022"),
            pd.concat([fixture(), fixture().iloc[[0]]]),
            fixture().assign(**{"Type rapport": "Jaarrekening"}),
        ]
        for index, data in enumerate(invalid):
            with self.subTest(case=index), self.assertRaises(ValueError):
                PIPELINE.filter_construction(data, "Meerjarenplan")

    def test_truncated_workbook_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "truncated.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.append(["Filters"])
            sheet.append(["Exported data limited to 150000 rows. Some data may have been omitted."])
            sheet.append(list(PIPELINE.REQUIRED))
            workbook.save(path)
            with self.assertRaisesRegex(ValueError, "truncated export"):
                PIPELINE.read_workbook(path)

    def test_incorrect_excel_used_range_does_not_drop_columns_or_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dimensions.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.append(["Filters"])
            sheet.append([])
            sheet.append(list(PIPELINE.REQUIRED))
            sheet.append(fixture().iloc[0].tolist())
            sheet.append(fixture().iloc[1].tolist())
            buffer = BytesIO()
            workbook.save(buffer)
            buffer.seek(0)
            with ZipFile(buffer) as source, ZipFile(path, "w", ZIP_DEFLATED) as target:
                for name in source.namelist():
                    content = source.read(name)
                    if name == "xl/worksheets/sheet1.xml":
                        content = content.replace(b'ref="A1:H5"', b'ref="A1:A1"')
                    target.writestr(name, content)
            data, _ = PIPELINE.read_workbook(path)
            self.assertEqual(data.shape, (2, 8))
            self.assertEqual(data.Uitgave.tolist(), [10.25, 10.25])


class OctoberPublishedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = json.loads((PUBLIC / "yearly_comparison.json").read_text())
        cls.snapshot = json.loads((PUBLIC / "source_snapshot.json").read_text())

    def test_shape_and_missing_accounts_are_not_zero(self):
        rows = self.dataset["rows"]
        self.assertEqual([r["Boekjaar"] for r in rows], list(range(2014, 2032)))
        for row in rows:
            self.assertIsNotNone(row["latest"])
            self.assertIsNotNone(row["original"])
            if row["Boekjaar"] > 2025:
                self.assertIsNone(row["actual"])
                self.assertIsNone(row["municipalities"]["actual"])
            else:
                self.assertIsNotNone(row["actual"])

    def test_downloadable_cells_reconcile_to_every_chart_value(self):
        for key in PIPELINE.SOURCES:
            with self.subTest(source=key):
                data = pd.read_csv(PUBLIC / f"construction_{key}.csv", dtype={"NIS-code": str})
                self.assertTrue(data.Uitgave.gt(0).all())
                self.assertEqual(set(data["Niveau 5"].str.split().str[0]), set(PIPELINE.SCOPE))
                totals = data.groupby("Boekjaar").Uitgave.sum().to_dict()
                for row in self.dataset["rows"]:
                    self.assertEqual(row[key], totals.get(row["Boekjaar"]))

    def test_claims_and_hashes_point_to_exact_source(self):
        self.assertEqual(len(self.snapshot["claims"]), 48)
        for claim in self.snapshot["claims"]:
            source = self.snapshot["sources"][claim["source_id"]]
            self.assertEqual(claim["source_file_sha256"], source["sha256"])
            row = next(row for row in self.dataset["rows"] if row["Boekjaar"] == claim["book_year"])
            self.assertEqual(claim["value"], row[claim["source_id"]])
        for source in [*self.snapshot["sources"].values(), *self.snapshot["excluded_sources"]]:
            self.assertRegex(source["sha256"], r"^[a-f0-9]{64}$")

    def test_local_workbook_hashes_match_snapshot(self):
        sources = [*self.snapshot["sources"].values(), *self.snapshot["excluded_sources"]]
        if not all((PIPELINE.SOURCE_DIR / source["filename"]).exists() for source in sources):
            self.skipTest("Raw workbooks are local inputs; not checked into Git")
        for source in sources:
            path = PIPELINE.SOURCE_DIR / source["filename"]
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), source["sha256"])

    def test_complete_economic_exports_and_unusable_bv_are_documented(self):
        self.assertEqual({key: value["raw_rows"] for key, value in self.snapshot["sources"].items()},
                         {"latest": 103808, "original": 77050, "actual": 60780})
        excluded = self.snapshot["excluded_sources"]
        self.assertTrue(excluded[0]["export_warnings"])
        self.assertFalse(excluded[1]["export_warnings"])
        self.assertTrue(all("Niveau 5" not in source["columns"] for source in excluded))
        year2019 = next(row for row in self.dataset["rows"] if row["Boekjaar"] == 2019)
        self.assertEqual(year2019["municipalities"], {"latest": 283, "original": 285, "actual": 284})
        self.assertTrue(any("2019" in warning for warning in self.dataset["warnings"]))

    def test_october_default_and_portal_dropdown_wiring(self):
        groups = json.loads((ROOT / "scripts/analysis-versions.json").read_text())
        self.assertEqual(groups["gemeentelijke-investeringen"]["default"], APP.name)
        self.assertEqual(len(groups["gemeentelijke-investeringen"]["versions"]), 4)
        card = (ROOT / "apps/portal/src/components/AnalysisCard.tsx").read_text()
        self.assertIn("<select", card)
        self.assertIn("htmlFor={selectId}", card)
        self.assertNotIn("aria-pressed", card)


if __name__ == "__main__":
    unittest.main()
