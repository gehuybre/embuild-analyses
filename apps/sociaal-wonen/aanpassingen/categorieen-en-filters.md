# Categorieën en filters: wat staat waar en uit welke brondata komt het

Peildatum bron: 14 augustus 2026 (`2026_08_14_KTP.xlsx` en `2026_08_14_MJP.xlsx`). De

Gebruikte bronbladen: `FS4 Nieuwbouw`, `FS4 Renovatie` en `SSI KTP` (korte termijn) of `SSI MJP` (meerjarenplanning).

|                            |      KT |      LT |  Totaal |
|----------------------------|--------:|--------:|--------:|
| Rijen in de bron           |     192 |     440 |     632 |
| Weggelaten (zie hieronder) |      23 |       9 |      32 |
| **Opgenomen in de app**    | **169** | **431** | **600** |

## 1. Filter "Soort werken"

De indeling wordt bepaald door twee dingen: het bronblad en de bronkolom **Type**.

| Waarde in de filter | Bronblad | Bronkolom Type | Betekenis van de code | Rijen KT | Rijen LT |
|------------|------------|------------|------------|-----------:|-----------:|
| Nieuwbouw | FS4 Nieuwbouw | `NB` | Nieuwbouw | 14 | 120 |
| Vervangingsbouw | FS4 Nieuwbouw en FS4 Renovatie | `VVP`, `VEP` | Vervangingsbouw op verworven patrimonium (VVP) of eigen patrimonium (VEP) | 19 (5 VVP, 14 VEP) | 117 (38 VVP, 79 VEP) |
| Renovatie | FS4 Nieuwbouw en FS4 Renovatie | `RVP`, `REP` of geen type | Renovatie op verworven patrimonium (RVP) of eigen patrimonium (REP) | 86 (1 RVP, 85 REP) | 97 (6 RVP, 90 REP, 1 zonder type) |
| Sloop en Infrastructuur | SSI KTP en SSI MJP | geen (heel blad) | Subsidie Sloop en Infrastructuur (SSI) | 50 | 97 |
| **Totaal opgenomen** |  |  |  | **169** | **431** |
| Niet opgenomen: Aankoop goede woning | FS4 Nieuwbouw | `GW` | Aankoop goede woning, bewust weggelaten | 2 | 0 |
| Niet opgenomen: raamcontract | FS4 Renovatie | `REP`, `VEP` met procedure "Raamcontract" | Zie de tabel bij Plaatsingsprocedure | 0 | 7 |

Belangrijk om te weten:

-   De kolom **Type** krijgt voorrang op het blad. Een rij op het blad FS4 Nieuwbouw met type `RVP` of `VVP` wordt dus Renovatie of Vervangingsbouw, geen Nieuwbouw.
-   Renovatie is een verzamelcategorie. Alle vormen van renovatie (onder meer "Beperkte renovatie", "Beperkte renovatie (deelwerken)", "Deelrenovatie" en rijen zonder vermelding) staan samen onder Renovatie.
-   De SSI-bladen hebben geen kolom Type. Elke rij daar is automatisch Sloop en Infrastructuur.
-   Eén rij op het blad FS4 Renovatie van de MJP heeft geen type. Die wordt opgenomen onder de broncategorie van het blad, dus Renovatie.

## 2. Filter "Plaatsingsprocedure"

De bronkolom is **Extra info** (in de code `procedure` genoemd). Het script zoekt in de tekst, hoofdletters maken niet uit.

| Waarde in de filter | Regel | Bronwaarden die hieronder vallen | Rijen KT | Rijen LT |
|---------------|---------------|---------------|--------------:|--------------:|
| CBO | tekst bevat "cbo" | `CBO` (4), `CBO 2023-1` (3), `CBO 2023-2` (4), `CBO 2024-1` (8), `CBO 2024-2` (5), `CBO 2025-1` (8) | 0 | 32 |
| D&B | tekst bevat "d&b" of "design & build" | `D&B 2019` (7), `D&B 2021` (1), `D&B 2024` (1) | 0 | 9 |
| Reguliere procedure | alles wat niet onder CBO of D&B valt en niet is weggelaten | lege cel (122 KT, 390 LT, waarvan 50 KT en 97 LT SSI-rijen), `Beperkte renovatie` (44), `Beperkte renovatie (deelwerken)` (2), `Deelrenovatie` (1) | 169 | 390 |
| **Totaal opgenomen** |  |  | **169** | **431** |
| Niet opgenomen: Raamcontract | tekst bevat "raamcontract" | `Raamcontract` (6 bij `REP`, 1 bij `VEP`) | 0 | 7 |
| Niet opgenomen: MW2023 | tekst bevat "mw2023" | `MW2023` (2 rijen nieuwbouw) | 0 | 2 |
| Niet opgenomen: RC Beperkte renovatie | tekst bevat "rc beperkte renovatie" | `RC Beperkte renovatie` (alle `REP`) | 21 | 0 |
| Niet opgenomen: Aankoop goede woning | via Soort werken (type `GW`), kolom Extra info is leeg | geen | 2 | 0 |
| **Totaal weggelaten** |  |  | **23** | **9** |

Belangrijk om te weten:

-   CBO en D&B zijn volledig gescheiden gehouden. De jaarvarianten (bijvoorbeeld CBO 2024-1 en CBO 2024-2) zijn samengenomen onder één waarde.
-   CBO en D&B komen alleen voor op de MJP. Op de KTP staat alles onder Reguliere procedure.
-   "Reguliere procedure" is een restcategorie. Ook waarden die eigenlijk geen procedure zijn, zoals "Beperkte renovatie" en "Deelrenovatie", komen daar terecht. Ze staan in de kolom Extra info, maar beschrijven het type werken.
-   Raamcontract, MW2023 en RC Beperkte renovatie worden vóór de indeling verwijderd. Ze zitten dus niet in de app, de kaart, de histogrammen of de download.

## 3. Huurwoningen (categorie)

Bronvariabele per type bronblad:

-   **FS4-bladen** (nieuwbouw, vervangingsbouw, renovatie): kolom `Huur`.
-   **SSI-bladen:** de som van de kolommen `Huur` en `Koop`.

Het aantal wordt per verrichting omgezet naar een klasse. Bij totalen per gemeente of woonmaatschappij wordt eerst opgeteld en daarna ingedeeld.

| Categorie         | Regel            | Rijen KT | Rijen LT |
|-------------------|------------------|---------:|---------:|
| Geen huurwoningen | 0 of lager       |        0 |        1 |
| 1–10              | 1 tot en met 10  |       45 |      111 |
| 11–25             | 11 tot en met 25 |       49 |      141 |
| 26–50             | 26 tot en met 50 |       29 |       72 |
| Meer dan 50       | meer dan 50      |       46 |      106 |
| Niet vermeld      | cel is leeg      |        0 |        0 |
| **Totaal**        |                  |  **169** |  **431** |

## 4. Kostprijs (categorie)

Bronvariabele per type bronblad:

-   **FS4-bladen** (nieuwbouw, vervangingsbouw, renovatie): kolom `Kostprijs`.
-   **SSI KTP:** kolom `SSI` (de laatste kolom van het blad).
-   **SSI MJP:** kolom `Bedrag UP`. De kolom `SSI` bestaat alleen op het KTP-blad. Op het MJP-blad heet de kolom met het bedrag `Bedrag UP`, de volgende kolommen zijn leeg.
-   Niet gebruikt: `Maximumprijs VMSW` en `Bedrag UP` op de FS4-bladen. Kostprijs is de enige kostenmaatstaf, zoals gevraagd in [aanpassingen.md](aanpassingen.md).

| Categorie | Regel | Rijen KT | Rijen LT |
|----|----|---:|---:|
| Minder dan €1 mln | onder € 1.000.000 | 102 | 124 |
| €1–5 mln | € 1.000.000 tot en met € 5.000.000 | 51 | 197 |
| €5–10 mln | boven € 5.000.000 tot en met € 10.000.000 | 12 | 68 |
| Meer dan €10 mln | boven € 10.000.000 | 4 | 42 |
| Niet beschikbaar in bron | cel is leeg | 0 | 0 |
| **Totaal** |  | **169** | **431** |

Bij totalen per gemeente of woonmaatschappij worden de kostprijzen eerst opgeteld. Rijen zonder kostprijs tellen dan niet mee. Heeft geen enkele rij een kostprijs, dan is het resultaat "Niet beschikbaar in bron".

## 5. Aandachtspunten

1.  De SSI-kostprijs is op de KTP en de MJP een andere kolom (`SSI` of `Bedrag UP`). Controleer bij Wonen in Vlaanderen of die twee kolommen inhoudelijk hetzelfde meten.
2.  Eén renovatierij op de MJP heeft geen type en staat onder Renovatie.
3.  De waarden "Beperkte renovatie" en "Deelrenovatie" staan in de kolom Extra info en komen daardoor onder Reguliere procedure. Wilt u die niet als procedure tonen, dan kan de indeling aangepast worden.
4.  De aantallen in dit bestand horen bij de bronbestanden van 14 augustus 2026. Bij een nieuwe levering moeten ze opnieuw geteld worden.