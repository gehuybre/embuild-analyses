import sys
import unittest
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from process_arrondissement_flows import (
    arrondissement_code,
    combine_metrics,
    parse_arrondissement_table,
    validate_province_totals,
)

FIXTURE = """
<div id="pricePanel"><table class="pvtTable">
<thead>
<tr><th>Jaar</th><th colspan="2">2023</th><th colspan="2">2024</th></tr>
<tr><th>Provincie</th><th colspan="2">Provincie Vlaams-Brabant</th><th colspan="2">Provincie Vlaams-Brabant</th></tr>
<tr><th>Arrondissement</th><th>Arrondissement Leuven</th><th>Arrondissement Leuven</th></tr>
<tr><th>Aantal oprichtingen</th></tr>
</thead><tbody>
<tr><th>Alle economische activiteiten</th><td>5.199</td><td>14.280</td><td>5.232</td><td>13.774</td></tr>
<tr><th>F Bouwnijverheid</th><td>.</td><td>100</td><td>0</td><td>200</td></tr>
</tbody></table></div>
"""


class ArrondissementFlowsTests(unittest.TestCase):
    def test_parser_selects_arrondissement_not_province_subtotal(self):
        rows = parse_arrondissement_table(FIXTURE, "fr", "24000", "Arrondissement Leuven")
        totals = [row for row in rows if row["n1"] == "ALL"]
        self.assertEqual([row["fr"] for row in totals], [5199, 5232])
        sector = [row for row in rows if row["n1"] == "F"]
        self.assertEqual([row["fr"] for row in sector], [None, 0])

    def test_wrong_area_and_unknown_value_are_rejected(self):
        with self.assertRaises(ValueError):
            parse_arrondissement_table(FIXTURE, "fr", "23000", "Arrondissement Halle-Vilvoorde")
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            parse_arrondissement_table(FIXTURE.replace("<td>.</td>", "<td>confidential</td>"), "fr", "24000", "Arrondissement Leuven")

    def test_combine_requires_matching_cells_and_preserves_missing_values(self):
        starters = [{"y": 2024, "g": "24000", "n1": "F", "fr": None}]
        stoppers = [{"y": 2024, "g": "24000", "n1": "F", "st": 0}]
        self.assertEqual(combine_metrics(starters, stoppers)[0], {**starters[0], "st": 0})
        with self.assertRaises(ValueError):
            combine_metrics(starters, [])
        with self.assertRaises(ValueError):
            combine_metrics(starters * 2, stoppers)

    def test_province_validation_rejects_wrong_counts_and_missing_totals(self):
        areas = [{"code": "23000", "provinceCode": "20001"}, {"code": "24000", "provinceCode": "20001"}]
        rows = [{"y": 2024, "g": "23000", "n1": "ALL", "fr": 8542, "st": 5},
                {"y": 2024, "g": "24000", "n1": "ALL", "fr": 5232, "st": 4}]
        provinces = [{"y": 2024, "g": "20001", "n1": "ALL", "fr": 13774, "st": 9}]
        validate_province_totals(rows, areas, provinces)
        with self.assertRaises(ValueError):
            validate_province_totals([{**rows[0], "fr": 1}, rows[1]], areas, provinces)
        with self.assertRaisesRegex(ValueError, "Missing arrondissement totals"):
            validate_province_totals([{**rows[0], "fr": None}, rows[1]], areas, provinces)

    def test_statbel_aliases_and_shared_geocodes(self):
        self.assertEqual(arrondissement_code("Arrondissement Leuven"), "24000")
        self.assertEqual(arrondissement_code("Arrondissement Aat"), "51000")
        self.assertEqual(arrondissement_code("Arrondissement Doornik-Moeskroen"), "57000")
        with self.assertRaises(ValueError):
            arrondissement_code("Unknown")

    def test_published_arrondissement_totals_match_all_provinces(self):
        public = Path(__file__).resolve().parents[1] / "public/data"
        rows = json.loads((public / "vat_yearly_flows_arrondissements.json").read_text())
        lookups = json.loads((public / "vat_yearly_flows_arrondissements_lookups.json").read_text())
        provinces = json.loads((public / "vat_yearly_flows_provinces.json").read_text())
        self.assertEqual(len(lookups["arrondissements"]), 42)
        self.assertEqual(lookups["years"], list(range(2008, 2025)))
        totals = [row for row in rows if row["n1"] == "ALL"]
        self.assertEqual(len(totals), 42 * 17)
        self.assertTrue(all(row["fr"] is not None and row["st"] is not None for row in totals))
        self.assertTrue(any(row["fr"] is None for row in rows))
        validate_province_totals(rows, lookups["arrondissements"], provinces)
        leuven = next(row for row in totals if row["g"] == "24000" and row["y"] == 2024)
        self.assertEqual(leuven["fr"], 5232)


if __name__ == "__main__":
    unittest.main()
