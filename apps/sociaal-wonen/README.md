# sociaal-wonen

Kaart en tabel van de sociale woonprogrammatie per woonmaatschappij en gemeente.
Site: `/analyses/sociaal-wonen/`. Standalone: dezelfde app, gebouwd met lege basePath.

## Bronnen

- `data/2026_08_14_KTP.xlsx`: korte termijn (KT), verrichtingen klaar voor aanbesteding.
- `data/2026_08_14_MJP.xlsx`: meerjarenplanning (LT in de code), verrichtingen met geadviseerd voorontwerp.
- `data/Woonmaatschappijen-in-kaart_A2_o0pp46.pdf`: werkingsgebieden van de 41 woonmaatschappijen (januari 2025) en hun websites.

`data/` staat niet in git (`data/.gitignore`). De bronbladen `FS4 Nieuwbouw`, `FS4 Renovatie`, `SSI KTP` en `SSI MJP` worden verwerkt.
SSI betekent **Subsidie Sloop en Infrastructuur** en wordt als afzonderlijke categorie opgenomen. Voor SSI geldt de kolom SSI (KTP) of Bedrag UP (MJP) als kostprijs, enkel als klasse.

De publicatie houdt elke verrichting als aparte, niet-identificeerbare rij. Projectomschrijvingen, datums, typecodes, procedures,
exacte aantallen en exacte bedragen worden weggelaten. Woningenaantallen worden ingedeeld in `1–10`, `11–25`, `26–50` en `meer dan 50`;
kostprijzen in `minder dan €1 mln`, `€1–5 mln`, `€5–10 mln` en `meer dan €10 mln`. Er worden geen algemene totalen getoond.
Nieuwbouw, vervangingsbouw, overige renovatie en SSI zijn de werkcategorieën. Beperkte renovatie valt onder renovatie.
`Aankoop goede woning` (GW) en raamcontracten zijn uitgesloten; CBO, D&B en RC-renovatie (enkel KTP) worden getoond.
CBO en D&B zijn opgenomen en volledig gescheiden als plaatsingsprocedure (`Reguliere procedure`, `CBO`, `D&B`); jaarvarianten worden samengenomen.
Het overzicht bovenaan toont een histogram van het aantal verrichtingen per woningen- en kostprijsklasse. De download staat per gemeente gesorteerd.

## Privacyregel

**De openbare gegevens bevatten geen projectidentificatie of exacte waarden.**

- `scripts/process_data.py` publiceert alleen woonmaatschappij en locatiegegevens plus werk-, woningenaantal- en kostprijscategorieën.
- Interne dossier-ID's, projectomschrijvingen, datums en exacte bronbedragen/aantallen worden voor geen enkele horizon gepubliceerd.
- De webapp en xlsx-download tonen de verrichtingen afzonderlijk, uitsluitend met categorische waarden.
- `scripts/validate_public_data.py` (draait als `prebuild`) faalt bij identificerende velden, exacte waarden of onverwachte uitvoerbestanden.

## Data verversen (automatisch)

Zet de nieuwe `JJJJ_MM_DD_KTP.xlsx` en `JJJJ_MM_DD_MJP.xlsx` in `data/` (de bestandsnaam moet met de datum beginnen).
Het script kiest zelf de nieuwste per horizon en leidt de peildatum uit de bestandsnaam af.

```bash
cd analyses/apps/sociaal-wonen
python3 scripts/process_data.py           # eenmalig: verwerken + valideren
python3 scripts/process_data.py --watch   # blijft draaien en verwerkt elke nieuwe of gewijzigde xlsx/pdf vanzelf
```

Verwerking = ETL, kaartgeometrie, categorische download-xlsx, kwaliteitsrapport en validatie. Een nieuwe werkingsgebieden-PDF wordt automatisch opnieuw uitgelezen.
Daarna: committen en pushen om de site en de standalone versie te publiceren.

Het script stopt met een duidelijke melding (en gokt niet) bij een onbekende initiatiefnemer, gemeente of type, of als de totalen niet
overeenkomen met de totaalrijen van de bladen. Voeg dan een regel toe in `reference/wm_aliases.csv` of `reference/gemeente_fixes.csv`.
Naamvarianten zoals "Woonmaatschappij X" tegenover "WM X" worden automatisch herkend en gemeld.
Zie `reference/kwaliteitsrapport.md` voor wat er is afgeleid of gecorrigeerd.

### Download categoriegegevens

`public/data/sociaal-wonen-alle-gegevens.xlsx` wordt bij elke run opnieuw gemaakt uit de bronbestanden. Blad `Gegevens` bevat per
verrichting alleen planning, woonmaatschappij, provincie, gemeente, werkcategorie en de categorieën voor woningen en kostprijs.
Blad `Toelichting` beschrijft het programmatieproces en de gebruikte categorieën. De validator controleert de kolommen, categorische
waarden en het ontbreken van projectdetails en exacte bedragen/aantallen.

### Werkingsgebied per gemeente

De kaart in de PDF is een raster. `extract_wm_pdf.py` leidt per gemeentelabel de woonmaatschappij af uit de kleur eronder.
Onzekere gevallen staan in `reference/gemeente_wm_review.csv`. Vul daar `definitief_wm` in (een id uit `wm_aliases.csv`)
om de afleiding te overschrijven. Je keuze blijft behouden bij een volgende run. Vaste uitzonderingen staan in `reference/gemeente_wm_overrides.csv`.

## Embeds

`/embed/sociaal-wonen/{kaart|tabel}/`, met optionele parameters (prefix `sociaal-wonen.` of kaal):

| Parameter | Waarden |
|---|---|
| `horizon` | `kt` (standaard), `lt` |
| `wm` | id van de woonmaatschappij (bv. `thuispunt-gent`) |
| `gemeente` | NIS-code (5 cijfers) |
| `groep` | `nieuwbouw`, `vervangingsbouw`, `renovatie`, `ssi` |
| `plaatsing` | `Reguliere procedure`, `CBO`, `D&B` |
| `filters` | `0` verbergt de filterbalk |

Ongeldige of verouderde waarden vallen terug op de standaard. De knop "Insluiten" genereert de iframe-code met de actieve filters.
De provinciefilter is verwijderd; oude `provincie`-parameters worden genegeerd.
De keuze tussen korte termijn en meerjarenplanning staat bovenaan en omvat alles eronder (histogram, filters, kaart en tabellen) of tabel. De volledige pagina legt ook de stappen van de programmatie uit;
deze procesuitleg verschijnt niet in embeds.

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

De standalone versie wordt beveiligd door `cloudflare/_worker.js`. De deploy-workflow kopieert dat bestand naar de
dist-map (Pages "advanced mode"). Gebruikersnaam, wachtwoord en sessiesleutel staan niet in de code maar als secrets van het
Pages-project (Production): `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` en `BASIC_AUTH_SESSION_SECRET`. De sessiesleutel moet minstens
32 bytes willekeurige data bevatten. De worker ondersteunt zowel de browserprompt (HTTP Basic Auth) als een eigen HTML-aanmeldformulier
voor clients die die prompt niet tonen. Na aanmelden blijft de sessie 8 uur geldig via een `Secure`, `HttpOnly`-cookie.
Zonder gebruikersnaam of wachtwoord geeft de site een 503 en blijft ze dicht. De beveiliging geldt voor alle bestanden, ook de
download-xlsx en de JSON in `/data/`.
