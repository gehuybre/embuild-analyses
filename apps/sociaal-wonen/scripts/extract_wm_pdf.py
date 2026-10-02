#!/usr/bin/env python3
"""Haalt uit 'Woonmaatschappijen in kaart' (PDF, januari 2025):

1. de legende: woonmaatschappij, website (PDF-hyperlink), werkingsgebied-label, provincie, kleur;
2. per gemeentelabel op de kaart de woonmaatschappij, via de kleur onder het label (dichtste legendekleur).

De kaart in de PDF is een raster, dus de gemeente-naar-woonmaatschappij koppeling is een afleiding en geen
brondata. Elk resultaat krijgt een afstandsscore. De merge en de reviewlijst gebeuren in process_data.py,
waar ook de planningsdata als kruiscontrole beschikbaar is.

Uitvoer (reference/pdf_extract/):
  legend.json          woonmaatschappijen uit de legende
  labels_auto.csv      gemeentelabel, NIS, woonmaatschappij, kleurafstand, tweede keuze
  labels_unmatched.csv labelwoorden zonder gemeente
"""
from __future__ import annotations

import csv
import io
import json
import re
import statistics
import unicodedata
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

from geo_lib import APP_DIR, build_current_municipalities, name_index, norm

PDF = APP_DIR / "data/Woonmaatschappijen-in-kaart_A2_o0pp46.pdf"
OUT = APP_DIR / "reference/pdf_extract"

# Tikfouten en aaneengeplakte labels in de PDF (gecontroleerd tegen de kaart).
PDF_LABEL_FIXES = {"Wezenbeek-Oppem": "Wezembeek-Oppem"}
PDF_LABEL_SPLITS = {"MortselBoechout": ["Mortsel", "Boechout"]}


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def srgb_to_lab(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (lin(c) for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))


def lab_dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def extract_legend(page) -> list[dict]:
    swatches = [r for r in page.rects if r.get("non_stroking_color") is not None and 15 < r["width"] < 30]
    words = page.extract_words(extra_attrs=["fontname", "size"], keep_blank_chars=True, x_tolerance=2)
    col_x = sorted({round(w["x0"]) for w in words if w["size"] > 20 and w["text"] in
                    ("West-Vlaanderen", "Oost-Vlaanderen", "Antwerpen", "Vlaams-Brabant", "Limburg")})
    headers = {w["text"]: w["x0"] for w in words if w["size"] > 20}
    col_edges = sorted((headers[k], p) for k, p in [
        ("West-Vlaanderen", "WEST-VLAANDEREN"), ("Oost-Vlaanderen", "OOST-VLAANDEREN"),
        ("Antwerpen", "ANTWERPEN"), ("Vlaams-Brabant", "VLAAMS-BRABANT"), ("Limburg", "LIMBURG")])
    legend = []
    for h in page.hyperlinks:
        sw = [r for r in swatches if abs(r["top"] - h["top"]) < 4 and r["x1"] <= h["x0"] + 2]
        if not sw:
            raise SystemExit(f"Geen kleurstaal bij link {h['uri']}")
        sw = max(sw, key=lambda r: r["x1"])
        row = [w for w in words if h["top"] - 8 <= w["top"] <= h["bottom"] + 4
               and h["x0"] - 14 <= w["x0"] < h["x0"] + 260 and "Condensed" not in w["fontname"]
               and w["size"] < 20]
        names_ = [w for w in row if w["size"] >= 14]
        regions = [w for w in row if w["size"] < 14]
        assert len(names_) == 1, f"Legenderij onduidelijk bij {h['uri']}: {[w['text'] for w in row]}"
        name = names_[0]["text"].strip()
        region = re.sub(r"^[\s.]+", "", " ".join(w["text"] for w in sorted(regions, key=lambda w: w["x0"]))).strip()
        province = [p for x, p in col_edges if x <= sw["x0"] + 5][-1]
        legend.append({
            "id": slugify(name),
            "naam": name,
            "url": h["uri"],
            "werkingsgebied_label": region,
            "provincie_legende": province,
            "kleur": [round(c * 255) for c in sw["non_stroking_color"]],
        })
    ids = [l["id"] for l in legend]
    assert len(ids) == len(set(ids)) == 41, f"Verwacht 41 unieke woonmaatschappijen, kreeg {len(ids)}/{len(set(ids))}"
    return legend


def label_chains(words):
    """Bouw kandidaat-labels van 1 tot 3 regels, voor afgebroken en gesplitste namen."""
    def below(w):
        c = (w["x0"] + w["x1"]) / 2
        cand = [v for v in words if 3 < v["top"] - w["top"] < 16 and abs((v["x0"] + v["x1"]) / 2 - c) < 30]
        return min(cand, key=lambda v: (v["top"] - w["top"]) + abs((v["x0"] + v["x1"]) / 2 - c) * 0.3) if cand else None

    chains = {}
    for i, w in enumerate(words):
        seq, cur = [i], w
        for _ in range(2):
            nxt = below(cur)
            if nxt is None:
                break
            seq.append(words.index(nxt))
            cur = nxt
        chains[i] = seq
    return chains


def right_neighbour(words, i):
    w = words[i]
    cand = [(v["x0"] - w["x1"], j) for j, v in enumerate(words)
            if j != i and abs(v["top"] - w["top"]) < 2 and 0 <= v["x0"] - w["x1"] < 6]
    return min(cand)[1] if cand else None


def join_text(parts):
    out = parts[0]
    for p in parts[1:]:
        out = out + p if out.endswith("-") else out + " " + p
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    pdf = pdfplumber.open(PDF)
    page = pdf.pages[0]
    legend = extract_legend(page)
    (OUT / "legend.json").write_text(json.dumps(legend, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Legende: {len(legend)} woonmaatschappijen, {sum(1 for l in legend if l['url'])} websites")

    img_meta = page.images[0]
    pil = PdfReader(str(PDF)).pages[0].images[0].image.convert("RGB")
    W, H = pil.size
    px = pil.load()
    sx = W / (img_meta["x1"] - img_meta["x0"])
    sy = H / (img_meta["bottom"] - img_meta["top"])

    legend_lab = [(l["id"], srgb_to_lab(l["kleur"])) for l in legend]

    def sample(box):
        x0, top, x1, bottom = box
        xs = range(int((x0 - img_meta["x0"]) * sx), int((x1 - img_meta["x0"]) * sx))
        ys = range(int((top - img_meta["top"]) * sy), int((bottom - img_meta["top"]) * sy))
        pix = [px[x, y] for x in xs for y in ys if 0 <= x < W and 0 <= y < H]
        # randlijnen (bijna wit of donker) negeren
        pix = [p for p in pix if 60 < sum(p) / 3 < 248] or pix
        return tuple(statistics.median(p[c] for p in pix) for c in range(3))

    munis = build_current_municipalities()
    idx = name_index(munis)

    words = [w for w in page.extract_words(extra_attrs=["fontname", "size"], x_tolerance=1.5, y_tolerance=2)
             if "Condensed" in w["fontname"]]
    words.sort(key=lambda w: (w["top"], w["x0"]))
    chains = label_chains(words)

    used: set[int] = set()
    rows, unmatched = [], []
    for i in range(len(words)):
        if i in used:
            continue
        options = []  # (indices, tekst), langste verticale ketting eerst
        for L in (3, 2):
            seq = chains[i][:L]
            if len(seq) == L:
                options.append(seq)
        rn = right_neighbour(words, i)
        if rn is not None:
            options.append([i, rn])
        options.append([i])
        hit = None
        for seq in options:
            if any(j in used for j in seq):
                continue
            text = join_text([words[j]["text"] for j in seq])
            text = PDF_LABEL_FIXES.get(text, text)
            if norm(text) in idx or text in PDF_LABEL_SPLITS:
                hit = (seq, text)
                break
        if not hit:
            unmatched.append(words[i])
            continue
        seq, text = hit
        used.update(seq)
        box = (min(words[j]["x0"] for j in seq), min(words[j]["top"] for j in seq),
               max(words[j]["x1"] for j in seq), max(words[j]["bottom"] for j in seq))
        # aaneengeplakte labels: elk deel krijgt zijn eigen helft van het kader
        parts = PDF_LABEL_SPLITS.get(text, [text])
        for k, part in enumerate(parts):
            m = idx[norm(part)][0]
            w_ = (box[2] - box[0]) / len(parts)
            sub = (box[0] + k * w_, box[1], box[0] + (k + 1) * w_, box[3])
            lab = srgb_to_lab(sample(sub))
            ranked = sorted(((lab_dist(lab, c), wid) for wid, c in legend_lab))
            rows.append({
                "label": part, "nis": m["nis"], "gemeente": m["name"],
                "wm_id": ranked[0][1], "afstand": round(ranked[0][0], 1),
                "tweede_wm_id": ranked[1][1], "tweede_afstand": round(ranked[1][0], 1),
                "x": round(sub[0]), "y": round(sub[1]),
            })

    with open(OUT / "labels_auto.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    with open(OUT / "labels_unmatched.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["tekst", "x", "y"])
        for u in unmatched:
            w.writerow([u["text"], round(u["x0"]), round(u["top"])])

    nis_seen = {r["nis"] for r in rows}
    print(f"Labelwoorden: {len(words)}, gekoppeld aan gemeente: {len(rows)} labels, "
          f"{len(nis_seen)} unieke gemeenten van {len(munis)}; zonder koppeling: {len(unmatched)}")
    missing = sorted(m["name"] for m in munis if m["nis"] not in nis_seen)
    print("Gemeenten zonder label op de kaart:", missing)
    bad = [r for r in rows if r["afstand"] > 8]
    print(f"Labels met kleurafstand > 8 (Lab): {len(bad)}")


if __name__ == "__main__":
    main()
