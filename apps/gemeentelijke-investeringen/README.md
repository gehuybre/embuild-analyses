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
