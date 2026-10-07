import { Badge } from "@embuild/shared/components/ui/badge"

const MAY_VERSION_URL = "/analyses/gemeentelijke-investeringen/"
const SEPTEMBER_VERSION_URL = "/analyses/gemeentelijke-investeringen-2026-09/"
const COMPARISON_URL = "/analyses/gemeentelijke-investeringen-vergelijking/"

export function VersionNotice() {
  return (
    <aside
      role="note"
      aria-label="Over deze versie"
      className="rounded-lg border bg-muted/40 px-4 py-3 text-sm"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Versie februari 2026</Badge>
        <a href={MAY_VERSION_URL} className="text-primary hover:underline">
          Bekijk de versie van mei 2026
        </a>
        <a href={SEPTEMBER_VERSION_URL} className="text-primary hover:underline">
          Bekijk de versie van september 2026
        </a>
        <a href={COMPARISON_URL} className="text-primary hover:underline">
          Vergelijk de versies
        </a>
      </div>
      <ul className="m-0 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          Dit is een reconstructie van een vroege versie van de analyse, op basis van de BBC-DR-exports van januari 2026
          en het prijspeil van februari 2026. De cijfers van de beleidsdomeinen (BV) zijn opnieuw berekend uit de
          ruwe exports.
        </li>
        <li>
          Het meerjarenplan 2026 was toen nog onvolledig: 282 van de 285 gemeenten komen in de export voor (Boom,
          Alveringem en Maaseik ontbreken), en de economische rekening (REK) bevat voor 2026 slechts 275 gemeenten.
          Mede daardoor liggen de totalen voor 2026 lager dan in latere versies.
        </li>
        <li>
          De REK komt uit de verwerkte gegevens van 14 januari 2026, omdat de ruwe REK-exports niet bewaard zijn.
          Ze bevat vier categorieën, dus ook financiële en immateriële vaste activa.
        </li>
        <li>
          In de oorspronkelijk gepubliceerde cijfers zaten cellen met een foute schaal door een verwerkingsfout. Die zijn
          hier hersteld, zodat de totalen 1,1% (2014), 0,6% (2020) en 2,3% (2026) hoger liggen dan toen. Zie de
          vergelijking.
        </li>
      </ul>
    </aside>
  )
}
