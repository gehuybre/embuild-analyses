export function PlanningContext() {
  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold tracking-tight">Hoe verloopt de programmatie?</h2>
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        Een initiatiefnemer bereidt een project voor. Na de vereiste beleidstoetsen komt het op de projectenlijst; de programmatie
        gebeurt vervolgens per verrichting, zoals nieuwbouw, vervangingsbouw of renovatie.
      </p>
      <ol className="grid gap-3 text-sm leading-relaxed md:grid-cols-2">
        <li>
          <strong>Meerjarenplanning (MJP).</strong> Na advies over het voorontwerp kan een verrichting op de MJP komen. De uitvoering
          of plaatsingsprocedure kan dan binnen drie jaar starten.
        </li>
        <li>
          <strong>Korte termijnplanning (KTP).</strong> Hiervoor is een omgevingsvergunning en een aanbestedingsklaar dossier nodig.
          De uitvoering of plaatsingsprocedure kan binnen acht maanden starten.
        </li>
        <li>
          <strong>Jaarbudget en toewijzing.</strong> Na de aanbesteding dient de woonmaatschappij een gunningsdossier in. De werken
          starten pas nadat Wonen in Vlaanderen middelen uit het jaarbudget heeft toegewezen.
        </li>
        <li>
          <strong>Beoordelingscommissie.</strong> De commissie adviseert en beslist onder meer over schrappingen en opnames in de KTP.
          Opnames op de MJP en KTP gebeuren ook doorlopend door Wonen in Vlaanderen.
        </li>
      </ol>
    </section>
  )
}
