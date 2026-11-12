type Stage = {
  nr: number
  title: string
  who: string
  condition: string
  outcome: string
  start: number
  span: number
  shown?: string
}

// Kolommen = opeenvolgende fasen van links naar rechts; elke balk loopt van het begin van zijn fase tot de overdracht aan de volgende.
const STAGES: Stage[] = [
  {
    nr: 1, title: "Projectenlijst", start: 1, span: 1,
    who: "Initiatiefnemer en Wonen in Vlaanderen",
    condition: "De initiatiefnemer bereidt het project voor in het Projectportaal. Wonen in Vlaanderen en de gemeente voeren de beleidstoetsen uit (renovatietoets, lokale woontoets).",
    outcome: "Positief advies op alle toetsen: het project staat op de projectenlijst.",
  },
  {
    nr: 2, title: "Meerjarenplanning (MJP)", start: 2, span: 1, shown: "Meerjarenplanning in deze blog",
    who: "Woonmaatschappij en Wonen in Vlaanderen",
    condition: "Voorontwerp opgemaakt en positief geadviseerd door Wonen in Vlaanderen.",
    outcome: "Uitvoering of plaatsingsprocedure kan binnen drie jaar starten.",
  },
  {
    nr: 3, title: "Korte termijnplanning (KTP)", start: 3, span: 1, shown: "Korte termijn in deze blog",
    who: "Woonmaatschappij en Wonen in Vlaanderen",
    condition: "Omgevingsvergunning verkregen en aanbestedingsklaar dossier ingediend.",
    outcome: "Uitvoering of plaatsingsprocedure kan binnen acht maanden starten.",
  },
  {
    nr: 4, title: "Jaarbudget en toewijzing", start: 4, span: 1,
    who: "Woonmaatschappij en Wonen in Vlaanderen",
    condition: "Aanbesteding gebeurd en gunningsdossier ingediend.",
    outcome: "Wonen in Vlaanderen wijst middelen toe. Pas daarna worden de werken besteld bij de aannemer.",
  },
]

export function PlanningContext() {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Hoe verloopt de programmatie?</h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Een project wordt niet als geheel geprogrammeerd, wel de afzonderlijke verrichtingen ervan: nieuwbouw, vervangingsbouw, renovatie
          of sloop en infrastructuur. Elke verrichting doorloopt de onderstaande fasen van links naar rechts.
        </p>
      </div>

      {/* Tijdlijn vanaf md: gantt-achtig; op smal scherm een gewone lijst */}
      <div className="hidden md:block" role="img" aria-label="Tijdlijn van projectenlijst, meerjarenplanning, korte termijnplanning en jaarbudget">
        <div className="grid grid-cols-[9rem_repeat(4,minmax(0,1fr))] gap-y-1.5 text-xs">
          <div />
          {STAGES.map((s) => (
            <div key={s.nr} className="px-1 pb-1 text-center font-medium text-muted-foreground">
              Fase {s.nr}
            </div>
          ))}
          {STAGES.map((s) => (
            <div key={s.nr} className="contents">
              <div className="flex items-center pr-2 font-medium leading-tight">{s.title}</div>
              <div
                className={`flex min-h-9 items-center rounded px-2 py-1.5 leading-tight ${s.shown ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                style={{ gridColumn: `${s.start + 1} / span ${s.span}`, marginLeft: `${(s.start - 1) * 0}rem` }}
              >
                {s.shown ?? s.outcome.split(".")[0]}
              </div>
            </div>
          ))}
          <div className="flex items-center pr-2 font-medium leading-tight">Beoordelingscommissie</div>
          <div className="col-span-4 flex min-h-9 items-center rounded border border-dashed px-2 py-1.5 leading-tight text-muted-foreground">
            Doorlopend: Wonen in Vlaanderen neemt wekelijks verrichtingen op in de MJP en KTP. De commissie komt minstens drie keer per jaar samen voor schrappingen en opnames in de KTP.
          </div>
        </div>
      </div>

      <ol className="grid gap-3 text-sm leading-relaxed md:grid-cols-4">
        {STAGES.map((s) => (
          <li key={s.nr} className="space-y-1 rounded-md border p-3">
            <p className="font-semibold">{s.nr}. {s.title}</p>
            <p className="text-xs text-muted-foreground">{s.who}</p>
            <p><span className="font-medium">Voorwaarde:</span> {s.condition}</p>
            <p><span className="font-medium">Resultaat:</span> {s.outcome}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
