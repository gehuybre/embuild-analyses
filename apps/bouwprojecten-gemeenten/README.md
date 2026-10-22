# Bouwprojecten per gemeente

De broncode van beide gepubliceerde versies staat onder `versions/`:

| Versie | App-slug |
| --- | --- |
| Vorige versie | `bouwprojecten-gemeenten` |
| September 2026 | `bouwprojecten-gemeenten-2026-09` |

De stabiele app-slugs blijven ongewijzigd voor bestaande site- en embed-URL's.
De standaardversie en versiekiezer worden beheerd in
[`scripts/analysis-versions.json`](../../scripts/analysis-versions.json).
Elke standalone build krijgt in het workflowartifact een README met de
voorgestelde Cloudflare-link.

Voor een volgende versie kopieer je de bronapp naar een nieuwe map onder
`versions/`, behoud je de bestaande package-slug conventie, en voeg je de
versie toe aan `analysis-versions.json`. `pnpm-workspace.yaml` en de app-registry
ontdekken geneste versies automatisch.
