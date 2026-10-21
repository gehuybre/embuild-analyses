"""
Process the S and s values (loon- en sociale lastenwaarden) from FOD Economie.

Sources (PDF, omzendbrieven 544.xxx):
  - Current:  prijzen-bouw-waarden-S-s.pdf            (latest circular, monthly/quarterly update)
  - History:  prijzen-bouw-waarden-S-s-Historiek.pdf  (all circulars since 2001, bootstrap only)

Output: data/waarden-S-s.csv, one row per (effective date, regime, employer size, category).
Dashboard: public/data/labor_indices.json (only offers from 11/06/2007).
PDF snapshots in public/data/sources/ retain stable, 1-based verification page links.
Existing CSVs without page provenance trigger a history rebuild on the next refresh.
The separate starting date for capital S (tenders) is extracted from the table heading.
The calculator selects S/s by their applicability period and I-2021 by calendar month;
unpublished material months are not replaced by older observations.

Usage:
  python process_s_s_waarden.py              # update from the current PDF (history only if CSV missing)
  python process_s_s_waarden.py --historiek  # (re)build from the history PDF, then apply the current one
  python process_s_s_waarden.py --export-existing  # export local CSV when the source is unavailable;
                                                # missing page links are explicitly reported
  python process_s_s_waarden.py --history-pdf PATH --current-pdf PATH  # use local source PDFs

Requires `pdftotext` (poppler-utils) on the PATH.
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
from datetime import date
from hashlib import sha256
from pathlib import Path

import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
OUTPUT_CSV = DATA_DIR / "waarden-S-s.csv"
PUBLIC_DIR = SCRIPT_DIR.parent / "public" / "data"
REGIME = "offerten vanaf 11/06/2007"

BASE_URL = "https://economie.fgov.be/sites/default/files/Files/Entreprises/"
CURRENT_URL = BASE_URL + "prijzen-bouw-waarden-S-s.pdf"
HISTORY_URL = BASE_URL + "prijzen-bouw-waarden-S-s-Historiek.pdf"
SOURCE_PAGE_URL = "https://economie.fgov.be/nl/themas/ondernemingen/specifieke-sectoren/bouw/prijsherzieningsindexen"
MIN_VALID_PDF_BYTES = 10_000
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,*/*;q=0.8",
    "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
    "Referer": SOURCE_PAGE_URL,
}

KEY = ["effective_date", "regime", "employer_size", "category"]
COLUMNS = [
    "effective_date",
    "initial_effective_date",
    "valid_until",
    "circular",
    "regime",
    "employer_size",
    "avg_wage",
    "currency",
    "category",
    "social_charges_pct",
    "value",
    "source_pdf",
    "source_page",
]
EURO_START = date(2002, 1, 1)

NUM = r"\d[\d.]*[,.]\d+"
DATE_RE = r"(\d{1,2})[./](\d{1,2})[./](\d{4})"
ROW_RE = re.compile(
    rf"^\s*(?P<wage>{NUM})\s+A\s*=\s*(?P<pa>[\d,;.]+)\s*%\s+s\s+op(?:\s+{DATE_RE})?"
    rf"\s+(?P<a>{NUM})\s+(?P<b>{NUM})\s+(?P<c>{NUM})\s+(?P<d>{NUM})"
)
DIGITS_RE = re.compile(rf"^\s*(?:{DATE_RE})?\s*(?P<digits>(?:\d\s+)*\d)\s*$")
PCT_RE = re.compile(r"^\s*(?:(?:{n})\s+)?(?P<cat>[BCD])\s*=\s*(?P<pct>[\d,;.]+)\s*%".format(n=NUM))
PERIOD_RE = re.compile(rf"van\s+{DATE_RE}\s+tot\s+{DATE_RE}", re.IGNORECASE)
CIRCULAR_RE = re.compile(r"OMZENDBRIEF\s+nr\.?\s*([\d.\-]+)", re.IGNORECASE)
HEADING_RE = re.compile(rf"Waarden\s+kleine\s+.s.\s+op\s+(?P<d>\d{{1,2}})[./](?P<m>\d{{1,2}})[./]?(?P<y>\d{{4}})", re.IGNORECASE)


class SourceUnavailable(RuntimeError):
    """Raised when the official source is temporarily unavailable or invalid."""


def to_float(text: str) -> float:
    text = text.strip().replace(";", ",")
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    return float(text)


def to_date(d: str, m: str, y: str) -> date:
    return date(int(y), int(m), int(d))


def download_pdf(url: str, target: Path) -> None:
    session = requests.Session()
    try:
        session.get(SOURCE_PAGE_URL, headers=REQUEST_HEADERS, timeout=60)
        response = session.get(url, headers=REQUEST_HEADERS, timeout=180)
    except requests.RequestException as exc:
        raise SourceUnavailable(f"Download van {url} mislukt: {exc}") from exc
    content = response.content
    if response.status_code != 200 or not content.startswith(b"%PDF") or len(content) < MIN_VALID_PDF_BYTES:
        preview = " ".join(content[:200].decode("utf-8", errors="replace").split())
        raise SourceUnavailable(
            f"{url} gaf geen geldige PDF (status {response.status_code}, {len(content)} bytes): {preview}"
        )
    target.write_bytes(content)


def pdf_to_lines(pdf: Path) -> list[str]:
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True
        )
    except FileNotFoundError as exc:
        raise SystemExit("pdftotext niet gevonden (installeer poppler-utils)") from exc
    return result.stdout.split("\n")


def classify_regime(heading: str) -> str:
    """Offer-date regime a table belongs to."""
    h = " ".join(heading.split()).replace("“", '"').replace("”", '"')
    has_1981 = re.search(r"11[./]0?7[./]1981", h)
    has_2007 = re.search(r"11[./]0?6[./]2007", h)
    if re.search(r"gesloten", h, re.IGNORECASE):
        return "offerten gesloten voor 11/07/1981"
    if has_1981 and has_2007:
        return "offerten 11/07/1981 tot 11/06/2007"
    if has_1981:
        return "offerten vanaf 11/07/1981"
    if has_2007:
        return "offerten vanaf 11/06/2007"
    return "onbekend"


def classify_size(label: str) -> str:
    l = " ".join(label.lower().split())
    if "minder dan 10" in l:
        return "<10 werklieden"
    if "10 tot 20" in l:
        return "10-20 werklieden"
    if "meer dan 20" in l:
        return ">20 werklieden"
    if "10 of meer" in l:
        return ">=10 werklieden"
    if "meer dan 10" in l:
        return ">10 werklieden"
    return "onbekend"


def parse_lines(lines: list[str]) -> tuple[pd.DataFrame, list[str]]:
    rows: list[dict] = []
    warnings: list[str] = []
    circular = None
    valid_until = None
    regime = "onbekend"
    size = "onbekend"
    eff = None
    initial_eff = None
    seen: set[tuple] = set()
    heading_buf: list[str] = []
    heading_left = 0
    page = 1
    pages = []
    for line in lines:
        page += line.count("\f")
        pages.append(page)

    i = 0
    while i < len(lines):
        line = lines[i]

        m = CIRCULAR_RE.search(line)
        if m:
            circular = re.sub(r"^544[.\-]", "544-", m.group(1).rstrip("."))
        if "Wijziging van" in line:
            # the validity period precedes the circular number; older circulars only give a single date
            p = PERIOD_RE.search(" ".join(lines[i : i + 3]))
            valid_until = to_date(*p.group(4, 5, 6)) if p else None

        hm = HEADING_RE.search(line)
        if hm:
            eff = to_date(hm["d"], hm["m"], hm["y"])
            heading_buf = [line]
            heading_left = 2  # headings wrap over up to three lines
            i += 1
            while heading_left and i < len(lines):
                nxt = lines[i]
                if re.search(r"voor werkgever|^\s*[a-d]\)|Gemiddeld", nxt):
                    break
                heading_buf.append(nxt)
                heading_left -= 1
                i += 1
            regime = classify_regime(" ".join(heading_buf))
            initial_match = re.search(
                rf'grote\s+"S".*?vanaf\s+{DATE_RE}', " ".join(heading_buf), re.IGNORECASE
            )
            initial_eff = to_date(*initial_match.groups()) if initial_match else None
            continue

        if re.search(r"voor werkgevers? die", line):
            size = classify_size(line)
            i += 1
            continue

        r = ROW_RE.match(line)
        if r:
            pct = {"A": to_float(r["pa"])}
            j = i + 1
            while len(pct) < 4 and j < min(i + 6, len(lines)):
                pm = PCT_RE.match(lines[j])
                if pm:
                    pct[pm["cat"]] = to_float(pm["pct"])
                j += 1
            wage = to_float(r["wage"])
            raw = {c: r[c.lower()] for c in "ABCD"}
            # narrow columns can wrap the last decimal onto the next line
            truncated = [c for c in "ABCD" if len(raw[c].split(",")[-1]) == 2]
            if truncated:
                for k in (i + 1, i + 2):
                    dm = DIGITS_RE.match(lines[k]) if k < len(lines) else None
                    if dm and len(dm["digits"].split()) == len(truncated):
                        for c, digit in zip(truncated, dm["digits"].split()):
                            raw[c] += digit
                        break
            # The heading date wins (the source has typos in row dates), unless that slot is already taken:
            # one 2003 table has no heading of its own and only its row date is right.
            rd = re.search(rf"s\s+op\s+{DATE_RE}", line)
            row_date = to_date(*rd.groups()[:3]) if rd else None
            row_eff = eff if eff is not None else row_date
            if row_eff is None:
                warnings.append(f"regel {i + 1}: tabel zonder datum")
                i = j
                continue
            if row_date is not None and row_date != row_eff:
                if (row_eff, regime, size) in seen:
                    row_eff = row_date
                warnings.append(
                    f"regel {i + 1}: kopdatum {eff} en rijdatum {row_date} verschillen, {row_eff} gebruikt"
                )
            seen.add((row_eff, regime, size))
            eff_row = row_eff
            values = {c: to_float(raw[c]) for c in "ABCD"}
            for cat in "ABCD":
                if cat not in pct:
                    warnings.append(f"{eff_row} {regime} {size}: sociale lasten {cat} ontbreekt (regel {i + 1})")
                    continue
                expected = wage * (1 + pct[cat] / 100)
                if abs(expected - values[cat]) > max(0.01, values[cat] * 0.0005):
                    warnings.append(
                        f"{eff_row} {regime} {size} cat {cat}: waarde {values[cat]} wijkt af van "
                        f"loon x (1+%) = {expected:.3f} (regel {i + 1})"
                    )
                rows.append(
                    {
                        "effective_date": eff_row.isoformat(),
                        "initial_effective_date": initial_eff.isoformat() if initial_eff else None,
                        "valid_until": valid_until.isoformat() if valid_until else None,
                        "circular": circular,
                        "regime": regime,
                        "employer_size": size,
                        "avg_wage": wage,
                        "currency": "EUR" if eff_row >= EURO_START else "BEF",
                        "category": cat,
                        "social_charges_pct": pct[cat],
                        "value": values[cat],
                        "source_page": pages[i],
                    }
                )
            i = j
            continue
        i += 1

    df = pd.DataFrame(rows, columns=COLUMNS)
    return df, warnings


def parse_pdf(pdf: Path) -> pd.DataFrame:
    df, warnings = parse_lines(pdf_to_lines(pdf))
    for w in warnings:
        print(f"  WAARSCHUWING: {w}", file=sys.stderr)
    if df.empty:
        raise SourceUnavailable(f"Geen tabellen gevonden in {pdf.name}; layout gewijzigd?")
    unknown = df[(df["regime"] == "onbekend") | (df["employer_size"] == "onbekend")]
    if not unknown.empty:
        print(f"  WAARSCHUWING: {len(unknown)} rijen met onbekend regime of werkgeversgrootte", file=sys.stderr)
    # circulars occur twice or get reissued with identical values (e.g. 544-785/544-787); the PDF lists newest first
    df = df.drop_duplicates([c for c in COLUMNS if c not in ("circular", "valid_until", "source_pdf", "source_page")]).reset_index(drop=True)
    dup = df.duplicated(KEY, keep=False)
    if dup.any():
        print(f"  WAARSCHUWING: {int(dup.sum())} rijen met dubbele sleutel", file=sys.stderr)
    filename = f"s-s-{sha256(pdf.read_bytes()).hexdigest()[:16]}.pdf"
    (PUBLIC_DIR / "sources").mkdir(parents=True, exist_ok=True)
    (PUBLIC_DIR / "sources" / filename).write_bytes(pdf.read_bytes())
    df["source_pdf"] = f"/data/sources/{filename}"
    return df


def write_public_data(df: pd.DataFrame) -> None:
    selected = df.loc[df["regime"] == REGIME].copy()
    if selected.empty:
        raise ValueError("Geen S/s-waarden voor offerten vanaf 11/06/2007")
    selected = selected.reindex(columns=COLUMNS)
    missing_sources = selected[["source_pdf", "source_page"]].isna().any(axis=1)
    if missing_sources.any():
        print(
            f"WAARSCHUWING: {int(missing_sources.sum())} waarden zonder PDF-pagina; "
            "voer --historiek uit zodra de bron beschikbaar is.",
            file=sys.stderr,
        )
    if selected.duplicated(KEY).any():
        raise ValueError("Dubbele S/s-waarden voor dezelfde datum, werkgeversgrootte en categorie")
    if not selected["currency"].eq("EUR").all() or not selected["value"].gt(0).all():
        raise ValueError("Ongeldige S/s-waarden of munteenheid")
    selected["source_page"] = selected["source_page"].astype("Int64")
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    records = json.loads(selected.to_json(orient="records"))
    (PUBLIC_DIR / "labor_indices.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def merge(existing: pd.DataFrame | None, new: pd.DataFrame) -> pd.DataFrame:
    """New rows win over existing rows with the same key."""
    if existing is None or existing.empty:
        combined = new
    else:
        combined = pd.concat([existing.reindex(columns=COLUMNS), new[COLUMNS]], ignore_index=True)
    combined = combined.drop_duplicates(KEY, keep="last")
    return combined.sort_values(["effective_date", "regime", "employer_size", "category"]).reset_index(drop=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--historiek", action="store_true", help="bouw opnieuw op vanuit de historiek-PDF")
    parser.add_argument("--export-existing", action="store_true", help="exporteer de lokale CSV zonder download")
    parser.add_argument("--history-pdf", type=Path, help="gebruik een lokale historiek-PDF")
    parser.add_argument("--current-pdf", type=Path, help="gebruik een lokale huidige PDF")
    args = parser.parse_args()

    existing = pd.read_csv(OUTPUT_CSV, dtype={"circular": str}) if OUTPUT_CSV.exists() else None
    if args.export_existing:
        if existing is None:
            raise SystemExit(f"CSV ontbreekt: {OUTPUT_CSV}")
        write_public_data(existing)
        return 0
    need_history = (
        args.historiek or args.history_pdf is not None or existing is None or not set(COLUMNS).issubset(existing.columns)
        or existing.loc[
            existing["regime"] == REGIME, ["initial_effective_date", "source_pdf", "source_page"]
        ].isna().any().any()
    )

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        combined = None if args.historiek else existing
        try:
            if need_history:
                print("Lokale historiek verwerken..." if args.history_pdf else "Historiek downloaden en verwerken...")
                hist_pdf = args.history_pdf or tmp_dir / "historiek.pdf"
                if not args.history_pdf:
                    download_pdf(HISTORY_URL, hist_pdf)
                hist = parse_pdf(hist_pdf)
                print(f"  {len(hist)} rijen uit historiek")
                combined = merge(combined, hist)

            print("Lokale S/s-waarden verwerken..." if args.current_pdf else "Huidige S/s-waarden downloaden en verwerken...")
            cur_pdf = args.current_pdf or tmp_dir / "huidig.pdf"
            if not args.current_pdf:
                download_pdf(CURRENT_URL, cur_pdf)
            cur = parse_pdf(cur_pdf)
            print(f"  {len(cur)} rijen uit huidige PDF")
            combined = merge(combined, cur)
        except SourceUnavailable as exc:
            print(f"BRON NIET BESCHIKBAAR: {exc}", file=sys.stderr)
            return 1

    write_public_data(combined)
    combined.to_csv(OUTPUT_CSV, index=False)
    print(f"{OUTPUT_CSV.name}: {len(combined)} rijen, {combined['effective_date'].nunique()} periodes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
