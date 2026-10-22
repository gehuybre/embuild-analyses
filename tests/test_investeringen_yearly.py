import importlib.util
import json
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
APP_PATHS = {
    "gemeentelijke-investeringen": "gemeentelijke-investeringen/versions/2026-05",
    "gemeentelijke-investeringen-2026-09": "gemeentelijke-investeringen/versions/2026-09",
}


def load_pipeline(slug):
    path = ROOT / "apps" / APP_PATHS[slug] / "scripts/prepare_visualizations.py"
    spec = importlib.util.spec_from_file_location(slug, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture():
    return pd.DataFrame([
        {"NIS_code": nis, "Rapportjaar": plan, "Boekjaar": year, "Totaal": amount}
        for plan in (2014, 2020, 2026)
        for year in range(plan, plan + 6)
        for nis, amount in (("11001", 100.25), ("11002", 50.5))
    ])


class YearlyInvestmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pipelines = {slug: load_pipeline(slug) for slug in APP_PATHS}

    def test_all_years_sum_municipalities_and_policy_fields(self):
        data = fixture()
        extra_field = data.iloc[[0]].assign(Totaal=25.75)
        for slug, pipeline in self.pipelines.items():
            with self.subTest(slug=slug):
                rows = pipeline.build_bv_yearly_totals(pd.concat([data, extra_field]))
                self.assertEqual([r["Boekjaar"] for r in rows], list(range(2014, 2032)))
                self.assertEqual(rows[0]["Totaal"], 176.5)
                self.assertTrue(all(r["Totaal"] == 150.75 for r in rows[1:]))
                self.assertEqual([r["Rapportjaar"] for r in rows], [2014] * 6 + [2020] * 6 + [2026] * 6)

    def test_overlapping_plans_and_out_of_range_years_are_excluded(self):
        extras = pd.DataFrame([
            {"NIS_code": "11001", "Rapportjaar": plan, "Boekjaar": year, "Totaal": 999999.0}
            for plan, year in ((2014, 2013), (2014, 2020), (2020, 2026), (2020, 2027), (2026, 2032), (2026, 2033))
        ])
        for slug, pipeline in self.pipelines.items():
            with self.subTest(slug=slug):
                self.assertEqual(
                    pipeline.build_bv_yearly_totals(pd.concat([fixture(), extras])),
                    pipeline.build_bv_yearly_totals(fixture()),
                )

    def test_missing_year_is_not_silently_zero(self):
        for slug, pipeline in self.pipelines.items():
            with self.subTest(slug=slug):
                with self.assertRaisesRegex(ValueError, "every book year"):
                    pipeline.build_bv_yearly_totals(fixture().query("Boekjaar != 2022"))

    def test_non_finite_total_is_rejected(self):
        data = fixture()
        data.loc[data.Boekjaar == 2022, "Totaal"] = float("inf")
        for slug, pipeline in self.pipelines.items():
            with self.subTest(slug=slug):
                with self.assertRaisesRegex(ValueError, "non-finite"):
                    pipeline.build_bv_yearly_totals(data)

    def test_published_totals_match_parquet_and_existing_plan_totals(self):
        for slug, pipeline in self.pipelines.items():
            with self.subTest(slug=slug):
                public = ROOT / "apps" / APP_PATHS[slug] / "public/data"
                rows = json.loads((public / "bv_yearly_totals.json").read_text())
                source = pd.read_parquet(public / "investments_bv.parquet")
                self.assertEqual(rows, pipeline.build_bv_yearly_totals(source))
                plan_totals = json.loads((public / "bv_domain_all_summary.json").read_text())
                for plan in (2014, 2020, 2026):
                    expected = next(r["Totaal"] for r in plan_totals if r["Rapportjaar"] == plan and r["BV_domein"] == "__all__")
                    self.assertAlmostEqual(sum(r["Totaal"] for r in rows if r["Rapportjaar"] == plan), expected, places=4)
                for row in rows:
                    expected = source.loc[
                        (source.Rapportjaar == row["Rapportjaar"]) & (source.Boekjaar == row["Boekjaar"]),
                        "Totaal",
                    ].sum()
                    self.assertAlmostEqual(row["Totaal"], expected, places=4)


if __name__ == "__main__":
    unittest.main()
