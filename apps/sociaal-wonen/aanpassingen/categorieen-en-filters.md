# Overzicht opgenomen data

Peildatum bron: 14 augustus 2026 (`2026_08_14_KTP.xlsx` en `2026_08_14_MJP.xlsx`). De

Gebruikte bronbladen: `FS4 Nieuwbouw`, `FS4 Renovatie` en `SSI KTP` (korte termijn) of `SSI MJP` (meerjarenplanning).

|                            |      KT |      LT |  Totaal |
|----------------------------|--------:|--------:|--------:|
| Rijen in de bron           |     192 |     440 |     632 |
| Weggelaten (zie hieronder) |      23 |       9 |      32 |
| **Opgenomen in de app**    | **169** | **431** | **600** |

## 1. Filter "Soort werken"

| Waarde in de filter | Bronblad | Bronkolom Type | Betekenis van de code | Rijen KT | Rijen LT |
|------------|------------|------------|------------|-----------:|-----------:|
| Nieuwbouw | FS4 Nieuwbouw | `NB` | Nieuwbouw | 14 | 120 |
| Vervangingsbouw | FS4 Nieuwbouw en FS4 Renovatie | `VVP`, `VEP` | Vervangingsbouw op verworven patrimonium (VVP) of eigen patrimonium (VEP) | 19 (5 VVP, 14 VEP) | 117 (38 VVP, 79 VEP) |
| Renovatie | FS4 Nieuwbouw en FS4 Renovatie | `RVP`, `REP` of geen type | Renovatie op verworven patrimonium (RVP) of eigen patrimonium (REP) | 86 (1 RVP, 85 REP) | 97 (6 RVP, 90 REP, 1 zonder type) |
| Sloop en Infrastructuur | SSI KTP en SSI MJP | geen (heel blad) | Subsidie Sloop en Infrastructuur (SSI) | 50 | 97 |
| **Totaal opgenomen** |  |  |  | **169** | **431** |
| Niet opgenomen: Aankoop goede woning | FS4 Nieuwbouw | `GW` | Aankoop goede woning | 2 | 0 |
| Niet opgenomen: raamcontract | FS4 Renovatie | `REP`, `VEP` met procedure "Raamcontract" | Zie de tabel bij Plaatsingsprocedure | 0 | 7 |

## 2. Filter "Plaatsingsprocedure"

| Waarde in de filter | Regel | Bronwaarden die hieronder vallen | Rijen KT | Rijen LT |
|---------------|---------------|---------------|--------------:|--------------:|
| CBO |  | `CBO` (4), `CBO 2023-1` (3), `CBO 2023-2` (4), `CBO 2024-1` (8), `CBO 2024-2` (5), `CBO 2025-1` (8) | 0 | 32 |
| D&B |  | `D&B 2019` (7), `D&B 2021` (1), `D&B 2024` (1) | 0 | 9 |
| Reguliere procedure | alles wat niet onder CBO of D&B valt en niet is weggelaten | lege cel (122 KT, 390 LT, waarvan 50 KT en 97 LT SSI-rijen), `Beperkte renovatie` (44), `Beperkte renovatie (deelwerken)` (2), `Deelrenovatie` (1) | 169 | 390 |
| **Totaal opgenomen** |  |  | **169** | **431** |
| Niet opgenomen: Raamcontract |  | `Raamcontract` (6 bij `REP`, 1 bij `VEP`) | 0 | 7 |
| Niet opgenomen: MW2023 |  | `MW2023` (2 rijen nieuwbouw) | 0 | 2 |
| Niet opgenomen: RC Beperkte renovatie |  | `RC Beperkte renovatie` (alle `REP`) | 21 | 0 |
| Niet opgenomen: Aankoop goede woning |  |  | 2 | 0 |
| **Totaal weggelaten** |  |  | **23** | **9** |

## 3. Huurwoningen (categorie)

-   **FS4-bladen** (nieuwbouw, vervangingsbouw, renovatie): kolom `Huur`.

-   **SSI-bladen:** de som van de kolommen `Huur` en `Koop`.

| Categorie         | Regel            | Rijen KT | Rijen LT |
|-------------------|------------------|---------:|---------:|
| Geen huurwoningen | 0                |        0 |        1 |
| 1–10              | 1 tot en met 10  |       45 |      111 |
| 11–25             | 11 tot en met 25 |       49 |      141 |
| 26–50             | 26 tot en met 50 |       29 |       72 |
| Meer dan 50       | meer dan 50      |       46 |      106 |
| Niet vermeld      | cel is leeg      |        0 |        0 |
| **Totaal**        |                  |  **169** |  **431** |

## 4. Kostprijs (categorie)

-   **FS4-bladen** (nieuwbouw, vervangingsbouw, renovatie): kolom `Kostprijs`.
-   **SSI KTP:** kolom `SSI` (de laatste kolom van het blad).
-   **SSI MJP:** kolom `Bedrag UP`.

| Categorie | Regel | Rijen KT | Rijen LT |
|----|----|---:|---:|
| Minder dan €100.000 | onder € 100.000 | 41 | 24 |
| €100.000–250.000 | € 100.000 tot onder € 250.000 | 23 | 25 |
| €250.000–500.000 | € 250.000 tot onder € 500.000 | 21 | 29 |
| €500.000–1 mln | € 500.000 tot onder € 1.000.000 | 17 | 46 |
| €1–5 mln | € 1.000.000 tot en met € 5.000.000 | 51 | 197 |
| €5–10 mln | boven € 5.000.000 tot en met € 10.000.000 | 12 | 68 |
| Meer dan €10 mln | boven € 10.000.000 | 4 | 42 |
| Niet beschikbaar in bron | cel is leeg | 0 | 0 |
| **Totaal** |  | **169** | **431** |