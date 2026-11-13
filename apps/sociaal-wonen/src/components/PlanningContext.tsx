type Stage = {
  nr: number
  title: string
  who: string
  condition: string
  outcome: string
}

const STAGES: Stage[] = [
  {
    nr: 1, title: "Projectenlijst",
    who: "Initiatiefnemer en Wonen in Vlaanderen",
    condition: "De initiatiefnemer bereidt het project voor in het Projectportaal. Wonen in Vlaanderen en de gemeente voeren de beleidstoetsen uit (renovatietoets, lokale woontoets).",
    outcome: "Positief advies op alle toetsen: het project staat op de projectenlijst.",
  },
  {
    nr: 2, title: "Meerjarenplanning (MJP)",
    who: "Woonmaatschappij en Wonen in Vlaanderen",
    condition: "Voorontwerp opgemaakt en positief geadviseerd door Wonen in Vlaanderen.",
    outcome: "Uitvoering of plaatsingsprocedure kan binnen drie jaar starten.",
  },
  {
    nr: 3, title: "Korte termijnplanning (KTP)",
    who: "Woonmaatschappij en Wonen in Vlaanderen",
    condition: "Omgevingsvergunning verkregen en aanbestedingsklaar dossier ingediend.",
    outcome: "Uitvoering of plaatsingsprocedure kan binnen acht maanden starten.",
  },
  {
    nr: 4, title: "Jaarbudget en toewijzing",
    who: "Woonmaatschappij en Wonen in Vlaanderen",
    condition: "Aanbesteding gebeurd en gunningsdossier ingediend.",
    outcome: "Wonen in Vlaanderen wijst middelen toe. Pas daarna worden de werken besteld bij de aannemer.",
  },
]

export function PlanningContext() {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold tracking-tight">Hoe verloopt de programmatie?</h2>

      <ol className="grid gap-3 text-sm leading-relaxed md:grid-cols-4">
        {STAGES.map((s) => (
          <li key={s.nr} className="space-y-1 rounded-md border p-3">
            <p className="font-semibold">{s.nr}. {s.title}</p>
            <p className="text-xs text-muted-foreground">{s.who}</p>
            <p>{s.condition}</p>
            <p>{s.outcome}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
