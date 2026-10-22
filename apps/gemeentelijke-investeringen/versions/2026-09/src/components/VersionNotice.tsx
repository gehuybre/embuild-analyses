import { Badge } from "@embuild/shared/components/ui/badge"

const PREVIOUS_VERSION_URL = "/analyses/gemeentelijke-investeringen/"
const COMPARISON_URL = "/analyses/gemeentelijke-investeringen-vergelijking/"

export function VersionNotice() {
  return (
    <aside
      role="note"
      aria-label="Over deze versie"
      className="rounded-lg border bg-muted/40 px-4 py-3 text-sm"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Versie september 2026</Badge>
        <a href={PREVIOUS_VERSION_URL} className="text-primary hover:underline">
          Bekijk de vorige versie (mei 2026)
        </a>
        <a href={COMPARISON_URL} className="text-primary hover:underline">
          Vergelijk de twee versies
        </a>
      </div>
      <ul className="m-0 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          De beleidsdomeinen (BV) en de economische rekening (REK) zijn herberekend op de meerjarenplannen zoals ze in
          september 2026 uit de BBC-DR-gegevens zijn gehaald.
        </li>
        <li>
          De investeringsuitgaven omvatten terreinen en gebouwen, wegen en overige infrastructuur, erfgoed,
          onroerende goederen (I.1.B.2.a) en toegestane investeringssubsidies, net als in de versie van mei 2026. De
          totalen zijn dus vergelijkbaar. Financiële en immateriële vaste activa, roerende goederen en leasing zijn niet
          opgenomen. De REK toont daardoor enkel de categorieën materiële vaste activa en toegestane
          investeringssubsidies.
        </li>
        <li>
          De versie van mei 2026 is op 7 oktober 2026 gecorrigeerd voor een verwerkingsfout bij de rapportjaren 2014 en
          2020 (totalen ongeveer 1,1% en 0,6% te laag). Beide versies zijn nu vergelijkbaar; het verschil is uitgelegd
          in de vergelijking.
        </li>
      </ul>
    </aside>
  )
}
