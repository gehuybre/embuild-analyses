import json
import unittest
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = "bouwprojecten-gemeenten-2026-09"
APP = ROOT / "apps" / SLUG
DATA = APP / "public/data"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)


class SeptemberProjectsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.metadata = read_json(DATA / "projects_metadata.json")
        cls.projects = []
        for path in sorted(DATA.glob("projects_2026_chunk_*.json")):
            cls.projects.extend(read_json(path))

    def test_snapshot_totals_and_unique_keys(self):
        self.assertEqual(len(self.projects), 12377)
        self.assertEqual(self.metadata["total_projects"], len(self.projects))
        total = sum(Decimal(str(project["total_amount"])) for project in self.projects)
        self.assertEqual(total, Decimal("18255319693.71"))
        self.assertEqual(total, self.metadata["total_amount"])
        keys = {(project["nis_code"], project["ac_code"]) for project in self.projects}
        self.assertEqual(len(keys), len(self.projects))
        self.assertEqual(len({project["nis_code"] for project in self.projects}), 285)

    def test_yearly_amounts_reconcile(self):
        for project in self.projects:
            with self.subTest(key=(project["nis_code"], project["ac_code"])):
                self.assertEqual(
                    sum(Decimal(str(amount)) for amount in project["yearly_amounts"].values()),
                    Decimal(str(project["total_amount"])),
                )
                self.assertTrue(project["categories"])

    def test_scoped_files_reconcile(self):
        index = read_json(DATA / "municipality_index.json")
        self.assertEqual(len(index), 285)
        for entry in index:
            with self.subTest(nis=entry["nis_code"]):
                projects = read_json(DATA / entry["file"])
                self.assertEqual(len(projects), entry["project_count"])
                self.assertEqual(
                    sum(Decimal(str(project["total_amount"])) for project in projects),
                    entry["total_amount"],
                )
        for category in self.metadata["categories"].values():
            projects = read_json(DATA / category["data_file"])
            self.assertEqual(len(projects), category["project_count"])
            self.assertEqual(
                sum(Decimal(str(project["total_amount"])) for project in projects),
                category["total_amount"],
            )

    def test_herstappe_has_per_capita_values(self):
        projects = [project for project in self.projects if project["nis_code"] == "73028"]
        self.assertTrue(projects)
        self.assertTrue(all(project["amount_per_capita"] > 0 for project in projects))

    def test_source_fingerprints_and_claims(self):
        snapshot = read_json(DATA / "source_snapshot.json")
        self.assertEqual(snapshot["total_projects"], self.metadata["total_projects"])
        self.assertEqual(snapshot["total_amount"], self.metadata["total_amount"])
        self.assertEqual(snapshot["municipalities"], self.metadata["municipalities"])
        self.assertIsNone(snapshot["source_publication_date"])
        self.assertEqual(len(snapshot["input_hashes"]), 3)
        for entry in snapshot["input_hashes"]:
            self.assertRegex(entry["sha256"], r"^[a-f0-9]{64}$")

    def test_previous_version_retained_and_portal_grouped(self):
        previous = read_json(ROOT / "apps/bouwprojecten-gemeenten/public/data/projects_metadata.json")
        self.assertEqual(previous["total_projects"], 12251)
        self.assertEqual(previous["total_amount"], Decimal("18124920412.87"))
        portal = read_json(ROOT / "apps/portal/public/analyses.json")
        group = next(entry for entry in portal if entry["slug"] == "bouwprojecten-gemeenten")
        self.assertEqual(group["defaultVersion"], SLUG)
        self.assertEqual(
            {entry["slug"] for entry in group["versions"]},
            {SLUG, "bouwprojecten-gemeenten"},
        )
        browser = (APP / "src/components/ProjectBrowser.tsx").read_text()
        self.assertIn(f"/embed/{SLUG}/projectbrowser/", browser)
        self.assertNotIn("/embed/bouwprojecten-gemeenten/projectbrowser/", browser)
        self.assertTrue((APP / f"src/app/embed/{SLUG}/projectbrowser/page.tsx").exists())


if __name__ == "__main__":
    unittest.main()
