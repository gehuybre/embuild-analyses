# sociaal-wonen

Kaart en tabel van de geplande sociale huurwoningen per woonmaatschappij en gemeente, voor bouwbedrijven.
Site: `/analyses/sociaal-wonen/`. Standalone: dezelfde app, gebouwd met lege basePath.

## Bronnen

- `data/2026_08_14_KTP.xlsx`: korte termijn (KT), verrichtingen klaar voor aanbesteding.
- `data/2026_08_14_MJP.xlsx`: lange termijn (LT), verrichtingen met geadviseerd voorontwerp.
- `data/Woonmaatschappijen-in-kaart_A2_o0pp46.pdf`: werkingsgebieden van de 41 woonmaatschappijen (januari 2025) en hun websites.

`data/` staat niet in git (`data/.gitignore`). Alleen de gegenereerde `public/data/*.json` en `reference/` worden bewaard.
Enkel de bladen `FS4 Nieuwbouw` en `FS4 Renovatie` worden gebruikt. De SSI-bladen overlappen en zijn niet inbegrepen.

## Privacyregel

**LT is enkel geaggregeerd. Projectdetails bestaan alleen voor KT.**

- `scripts/process_data.py`: `PROJECT_LEVEL_HORIZONS = {"kt"}`. Voor LT wordt nooit een projectveld weggeschreven.
- Interne dossier-ID's (Woonproject, Verrichting, Identificatie) worden voor geen enkele horizon gepubliceerd.
- De app laadt `kt_projects.json` alleen bij horizon KT en op de projectentab.
- `scripts/validate_public_data.py` (draait als `prebuild`) faalt bij projectvelden buiten `kt_projects.json`.

## Data verversen (automatisch)

Zet de nieuwe `JJJJ_MM_DD_KTP.xlsx` en `JJJJ_MM_DD_MJP.xlsx` in `data/` (de bestandsnaam moet met de datum beginnen).
Het script kiest zelf de nieuwste per horizon en leidt de peildatum uit de bestandsnaam af.

```bash
cd analyses/apps/sociaal-wonen
python3 scripts/process_data.py           # eenmalig: verwerken + valideren
python3 scripts/process_data.py --watch   # blijft draaien en verwerkt elke nieuwe of gewijzigde xlsx/pdf vanzelf
```

Verwerking = ETL, kaartgeometrie, download-xlsx, kwaliteitsrapport en validatie. Een nieuwe werkingsgebieden-PDF wordt automatisch opnieuw uitgelezen.
Daarna: committen en pushen om de site en de standalone versie te publiceren.

Het script stopt met een duidelijke melding (en gokt niet) bij een onbekende initiatiefnemer, gemeente of type, of als de totalen niet
overeenkomen met de totaalrijen van de bladen. Voeg dan een regel toe in `reference/wm_aliases.csv` of `reference/gemeente_fixes.csv`.
Naamvarianten zoals "Woonmaatschappij X" tegenover "WM X" worden automatisch herkend en gemeld.
Zie `reference/kwaliteitsrapport.md` voor wat er is afgeleid of gecorrigeerd.

### Download alle gegevens

`public/data/sociaal-wonen-alle-gegevens.xlsx` wordt bij elke run opnieuw gemaakt uit de bronbestanden. Blad `Gegevens`: alle cijfers in
tidy formaat (een rij per waarneming, als Excel-tabel, klaar voor draaitabellen). Kolom `Planning` (korte/lange termijn) en `Niveau`:
KT staat op projectniveau, LT geaggregeerd (geen projectomschrijving, geen datum). Blad `Toelichting`: definities, kolomuitleg en types.
Er staan geen dossiernummers (Woonproject, Verrichting) in en de SSI-bladen zijn niet inbegrepen. De validator controleert de bladen,
de kolommen, het ontbreken van projectdetails bij LT en dat de totalen overeenkomen met de controletotalen.

### Werkingsgebied per gemeente

De kaart in de PDF is een raster. `extract_wm_pdf.py` leidt per gemeentelabel de woonmaatschappij af uit de kleur eronder.
Onzekere gevallen staan in `reference/gemeente_wm_review.csv`. Vul daar `definitief_wm` in (een id uit `wm_aliases.csv`)
om de afleiding te overschrijven. Je keuze blijft behouden bij een volgende run. Vaste uitzonderingen staan in `reference/gemeente_wm_overrides.csv`.

## Embeds

`/embed/sociaal-wonen/{kaart|tabel|projecten}/`, met optionele parameters (prefix `sociaal-wonen.` of kaal):

| Parameter | Waarden |
|---|---|
| `horizon` | `kt` (standaard), `lt` |
| `wm` | id van de woonmaatschappij (bv. `thuispunt-gent`) |
| `provincie` | `ANTWERPEN`, `LIMBURG`, `OOST-VLAANDEREN`, `VLAAMS-BRABANT`, `WEST-VLAANDEREN` |
| `gemeente` | NIS-code (5 cijfers) |
| `groep` | `nieuwbouw`, `renovatie` |
| `type` | `NB`, `VVP`, `RVP`, `GW`, `VEP`, `REP` |
| `procedure` | waarde uit de kolom Extra info, bv. `D&B 2019` |
| `modus`, `metric` | enkel kaart: `wm`/`gemeente`, `huur`/`kostprijs` |
| `filters` | `0` verbergt de filterbalk |

Ongeldige of verouderde waarden vallen terug op de standaard. De knop "Insluiten" genereert de iframe-code met de actieve filters.

## Site en standalone synchroon houden

Er is geen kopie om te synchroniseren: beide zijn builds van dezelfde broncode.

```bash
pnpm check:standalone -- sociaal-wonen        # bouwt beide en controleert ze
pnpm build:standalone -- sociaal-wonen        # enkel standalone, naar dist-standalone/sociaal-wonen
```

`next.config.mjs` gebruikt `hasOwnProperty` voor `NEXT_PUBLIC_BASE_PATH`. Een `||` zou een lege waarde laten terugvallen op de
site-basePath, zodat de standalone build toch naar `/analyses/sociaal-wonen` zou verwijzen.
Alle kaartgeometrie zit in `public/data/map.json`, de app hangt dus niet af van het gedeelde `/maps/` van de portal.

Publicatie van de standalone versie: `.github/workflows/deploy-sociaal-wonen-public.yml`. Vereist de repository-variabele
`CLOUDFLARE_PAGES_PROJECT_SOCIAAL_WONEN` en de bestaande secrets `CLOUDFLARE_ACCOUNT_ID` en `CLOUDFLARE_API_TOKEN`.

### Niet op de gedeelde site, wel standalone met wachtwoord

`package.json` bevat `"publishToSite": false`. De site-workflow (`deploy.yml`) bouwt de app dan niet, het portaal toont haar niet en
`merge-outputs.mjs` voegt haar niet toe aan `dist/`. Zie `scripts/site-apps.mjs`. Om de app later op de site te zetten: de vlag verwijderen.

De standalone versie wordt beveiligd met HTTP Basic Auth door `cloudflare/_worker.js`. De deploy-workflow kopieert dat bestand naar de
dist-map (Pages "advanced mode"). Gebruikersnaam en wachtwoord staan niet in de code maar als secrets van het Pages-project
(Production): `BASIC_AUTH_USER` en `BASIC_AUTH_PASSWORD`. Zonder die secrets geeft de site een 503 en blijft ze dicht.
De beveiliging geldt voor alle bestanden, ook de download-zip en de JSON in `/data/`.
