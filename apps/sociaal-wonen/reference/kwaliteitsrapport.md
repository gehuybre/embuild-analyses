# Kwaliteitsrapport sociaal-wonen

Gegenereerd door `scripts/process_data.py`. Bronbestanden: 2026_08_14_KTP.xlsx, 2026_08_14_MJP.xlsx.

## Controle tegen de totaalrijen in de bladen

'Totaal in blad' = totaalrij uit het bronblad plus de bedragen die in de bron als tekst staan en door de SUM van het blad worden overgeslagen (zie rij-specifieke opmerkingen).

| Horizon | Blad | Veld | Totaal in blad | Ingelezen | OK |
|---|---|---|---:|---:|---|
| KT | nieuwbouw | huur | 422 | 422 | ja |
| KT | nieuwbouw | kostprijs | 83,027,439 | 83,027,439 | ja |
| KT | nieuwbouw | bedrag_up | 101,067,150 | 101,067,150 | ja |
| KT | renovatie | huur | 15,522 | 15,522 | ja |
| KT | renovatie | kostprijs | 192,825,402 | 192,825,402 | ja |
| KT | renovatie | bedrag_up | 235,435,234 | 235,435,234 | ja |
| LT | nieuwbouw | huur | 3,888 | 3,888 | ja |
| LT | nieuwbouw | kostprijs | 719,324,802 | 719,324,802 | ja |
| LT | nieuwbouw | bedrag_up | 932,424,215 | 932,424,215 | ja |
| LT | renovatie | huur | 7,055 | 7,055 | ja |
| LT | renovatie | kostprijs | 1,231,927,255 | 1,231,927,255 | ja |
| LT | renovatie | bedrag_up | 1,443,904,159 | 1,443,904,159 | ja |

## Beslissingen en aandachtspunten

- SSI-bladen zijn niet inbegrepen (overlap met FS4).
- Huur wordt opgeteld zoals in de bron. Herhaalde huurwaarden binnen een verrichting zijn niet gecorrigeerd, zodat de totalen overeenkomen met de officiele totaalrij.
- Provincie is afgeleid uit de gemeente (NIS), niet uit de bronkolom.
- Projectdetails worden enkel voor KT gepubliceerd. Interne dossier-ID's (Woonproject, Verrichting) worden nooit gepubliceerd.

## Rij-specifieke opmerkingen

- kt/FS4 Nieuwbouw/rij 16: initiatiefnemer 'Wonen in Limburg – Kantoor Tongeren Koop' vermeldt 'Koop'; Huur = 22. Telt mee zoals in de bron.
- kt/FS4 Nieuwbouw/rij 24: gemeente gecorrigeerd naar Zemst. Bron noemt HAMME met provincie Vlaams-Brabant en initiatiefnemer Dijledal (Vlaams-Brabant). Hamme (Oost-Vlaanderen) is dan fout; Hamme is ook een deelgemeente van Zemst. AFGELEID, te bevestigen.
- kt/FS4 Nieuwbouw/rij 25: maximumprijs_vmsw staat als tekst in de bron ('€\xa0320.967,78'). De totaalrij van het blad telt die cel niet mee; wij wel.
- kt/FS4 Renovatie/rij 40: gemeente niet gespecificeerd (Woonboog, bron: None); telt mee in totalen en tabel, niet op de kaart.
- kt/FS4 Renovatie/rij 41: gemeente niet gespecificeerd (Woonboog, bron: None); telt mee in totalen en tabel, niet op de kaart.
- kt/FS4 Renovatie/rij 76: meerdere gemeenten (Wonen in Limburg - Kantoor Maaseik, bron: 'KINROOI/MAASEIK/BILSEN-STOKKEM/BREE'); telt mee in totalen en tabel, niet op de kaart.
- lt/FS4 Nieuwbouw/rij 139: initiatiefnemer 'Wonen in Limburg - Kantoor Pelt Koop' vermeldt 'Koop'; Huur = 20. Telt mee zoals in de bron.
- lt/FS4 Nieuwbouw/rij 145: initiatiefnemer 'Wonen in Limburg – Kantoor Beringen Koop' vermeldt 'Koop'; Huur = 26. Telt mee zoals in de bron.
- lt/FS4 Nieuwbouw/rij 154: initiatiefnemer 'Wonen in Limburg - Kantoor Pelt Koop' vermeldt 'Koop'; Huur = 6. Telt mee zoals in de bron.
- lt/FS4 Nieuwbouw/rij 158: maximumprijs_vmsw staat als tekst in de bron ('€ 12.192.940,26'). De totaalrij van het blad telt die cel niet mee; wij wel.
- lt/FS4 Nieuwbouw/rij 30: kostprijs staat als tekst in de bron ('€ 8.938.599,30'). De totaalrij van het blad telt die cel niet mee; wij wel.
- lt/FS4 Nieuwbouw/rij 30: maximumprijs_vmsw staat als tekst in de bron ('€ 10.138.196,22'). De totaalrij van het blad telt die cel niet mee; wij wel.
- lt/FS4 Renovatie/rij 21: geen type in de bron (Woonmaatschappij Rivierenland); getoond als 'Type niet vermeld'.
- lt/FS4 Renovatie/rij 24: provincie in bron (WEST-VLAANDEREN) wijkt af van die van EEKLO (OOST-VLAANDEREN); provincie afgeleid uit de gemeente.
