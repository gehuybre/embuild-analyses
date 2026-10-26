# Gemeentelijke investeringen

Deze map groepeert de vier gepubliceerde bronversies en de vergelijking:

| Versie | App-slug |
| --- | --- |
| Februari 2026 | `gemeentelijke-investeringen-2026-02` |
| Mei 2026 | `gemeentelijke-investeringen` |
| September 2026 | `gemeentelijke-investeringen-2026-09` |
| Oktober 2026 | `gemeentelijke-investeringen-2026-10` |
| Vergelijking | `gemeentelijke-investeringen-vergelijking` |

De broncode staat onder `versions/<versie>/`. De stabiele app-slugs blijven
ongewijzigd voor bestaande site- en embed-URL's. De portaalversies en standaard
worden beheerd in [`scripts/analysis-versions.json`](../../scripts/analysis-versions.json).

Nieuwe bronbestanden gaan naar
[`data/gemeentelijke-investeringen/inbox/`](../../data/gemeentelijke-investeringen/inbox/);
archiveer ze per datum voordat je de bijbehorende versie verwerkt. Elke
standalone build krijgt in het workflowartifact een README met de voorgestelde
Cloudflare-link.

## Embeds

Alle embedsecties van februari, mei, september en oktober tonen alleen de
visualisatie of tabel, titels, filters, legenda's en bronvermeldingen.
Inleidende uitleg, methodologische notities en aanvullende broncontrole staan
alleen op de volledige analysepagina. Dit wordt gedeeld geregeld met
`AnalysisOnly`, op basis van dezelfde embedroutedetectie als de exportknoppen.
Laad-, fout- en lege-selectiemeldingen blijven ook in embeds zichtbaar.

Regressietests: `node --test tests/test_investeringen_embeds.cjs` vanuit de
repositoryroot.
