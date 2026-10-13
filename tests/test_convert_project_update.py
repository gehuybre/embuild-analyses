import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

SCRIPTS = Path(__file__).resolve().parents[1] / "apps/bouwprojecten-gemeenten/scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("convert_project_update", SCRIPTS / "convert_project_update.py")
assert spec is not None and spec.loader is not None
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class ConvertProjectUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.reference = self.root / "reference.csv"
        self.workbook = self.root / "update.xlsx"
        self.output = self.root / "update.csv"
        self.reference_rows = [
            self.reference_row("11001", "Gemeente en OCMW Aartselaar", "AC1", "02 Mobiliteit"),
            self.reference_row("11002", "Gemeente en OCMW Antwerpen", "AC2", "07 Cultuur"),
        ]
        self.write_reference()

    def reference_row(self, nis, name, action, domain):
        row = {column: "" for column in converter.CSV_OUTPUT_COLUMNS}
        row.update({
            "NIS-code": nis, "Bestuur": name, "Beleidsdomein": domain,
            "Actie totaaloverzicht": f"Code: {action}\nKorte omschrijving: Werken\nLange omschrijving: Detail",
        })
        return row

    def write_reference(self):
        with self.reference.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=converter.CSV_OUTPUT_COLUMNS, delimiter=";")
            writer.writeheader()
            writer.writerows(self.reference_rows)

    def write_workbook(self, changes=None, duplicate=False):
        wb = Workbook()
        sheet = wb.active
        sheet.append(["Toegepaste filters"])
        sheet.append([])
        sheet.append(converter.REQUIRED_COLUMNS)
        row = {
            "Bestuur": "Gemeente en OCMW Aartselaar",
            "Beleidsdoelst. totaaloverzicht": "Code: BD1\nKorte omschrijving: Doel",
            "Actieplan totaaloverzicht": "Code: AP1\nKorte omschrijving: Plan",
            "Actie totaaloverzicht": 'Code: AC1\nKorte omschrijving: Weg; "centrum"\nLange omschrijving: Detail',
            "Type rapport": "Meerjarenplan", "Rapportjaar": 2026,
            "Boekjaar": 2032, "Uitgave": 1234.56,
        }
        row.update(changes or {})
        values = [row[column] for column in converter.REQUIRED_COLUMNS]
        sheet.append(values)
        if duplicate:
            sheet.append(values)
        wb.save(self.workbook)
        wb.close()

    def convert(self):
        return converter.convert_workbook(self.workbook, self.output, self.reference)

    def read_output(self):
        with self.output.open(encoding="utf-8", newline="") as handle:
            return list(csv.DictReader(handle, delimiter=";"))

    def test_format_and_policy_retention(self):
        self.write_workbook()
        stats = self.convert()
        row = self.read_output()[0]
        self.assertEqual(list(row), converter.CSV_OUTPUT_COLUMNS)
        self.assertEqual(row["NIS-code"], "11001")
        self.assertEqual(row["Uitgave"], "1234,56")
        self.assertEqual(row["Boekjaar"], "2032")
        self.assertIn('Weg; "centrum"\n', row["Actie totaaloverzicht"])
        self.assertEqual(row["Beleidsdomein"], "02 Mobiliteit")
        self.assertEqual(stats["classified_rows"], 1)

    def test_no_cross_municipality_classification(self):
        self.write_workbook({"Actie totaaloverzicht": "Code: AC2\nKorte omschrijving: Nieuw"})
        stats = self.convert()
        self.assertEqual(self.read_output()[0]["Beleidsdomein"], "")
        self.assertEqual(stats["actions_to_review"], 1)
        review = self.output.with_name("update_unclassified.csv").read_text()
        self.assertIn("No reference classification", review)

    def test_conflicting_policies_require_review(self):
        self.reference_rows.append(
            self.reference_row("11001", "Gemeente en OCMW Aartselaar", "AC1", "03 Natuur")
        )
        self.write_reference()
        self.write_workbook()
        self.assertEqual(self.convert()["actions_to_review"], 1)
        self.assertEqual(self.read_output()[0]["Beleidsdomein"], "")

    def test_invalid_rows_do_not_write_output(self):
        for changes in (
            {"Bestuur": "Unknown"},
            {"Uitgave": None},
            {"Uitgave": "invalid"},
            {"Rapportjaar": 2025},
            {"Boekjaar": 2026.5},
            {"Type rapport": "Jaarrekening"},
            {"Actie totaaloverzicht": "No code"},
        ):
            with self.subTest(changes=changes):
                self.write_workbook(changes)
                with self.assertRaises(ValueError):
                    self.convert()
                self.assertFalse(self.output.exists())

    def test_duplicate_rows_rejected(self):
        self.write_workbook(duplicate=True)
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self.convert()
        self.assertFalse(self.output.exists())

    def test_inputs_and_existing_outputs_protected(self):
        self.write_workbook()
        before = self.reference.read_bytes()
        with self.assertRaisesRegex(ValueError, "input file"):
            converter.convert_workbook(self.workbook, self.reference, self.reference, overwrite=True)
        self.assertEqual(self.reference.read_bytes(), before)
        self.convert()
        with self.assertRaises(FileExistsError):
            self.convert()

    def test_zero_negative_and_small_amounts_preserved(self):
        for value, expected in ((0, "0"), (-4.5, "-4,5"), (0.000001, "0,000001")):
            with self.subTest(value=value):
                self.write_workbook({"Uitgave": value})
                converter.convert_workbook(self.workbook, self.output, self.reference, overwrite=True)
                self.assertEqual(self.read_output()[0]["Uitgave"], expected)


if __name__ == "__main__":
    unittest.main()
