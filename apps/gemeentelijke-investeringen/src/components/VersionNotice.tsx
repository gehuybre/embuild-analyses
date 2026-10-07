import { Badge } from "@embuild/shared/components/ui/badge"

const SEPTEMBER_VERSION_URL = "/analyses/gemeentelijke-investeringen-2026-09/"
const FEBRUARY_VERSION_URL = "/analyses/gemeentelijke-investeringen-2026-02/"
const COMPARISON_URL = "/analyses/gemeentelijke-investeringen-vergelijking/"

export function VersionNotice() {
  return (
    <aside
      role="note"
      aria-label="Over deze versie"
      className="rounded-lg border bg-muted/40 px-4 py-3 text-sm"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Versie mei 2026</Badge>
        <a href={SEPTEMBER_VERSION_URL} className="text-primary hover:underline">
          Bekijk de versie van september 2026
        </a>
        <a href={FEBRUARY_VERSION_URL} className="text-primary hover:underline">
          Bekijk de versie van februari 2026
        </a>
        <a href={COMPARISON_URL} className="text-primary hover:underline">
          Vergelijk de versies
        </a>
      </div>
      <p className="m-0 text-muted-foreground">
        Gecorrigeerd op 7 oktober 2026: de cijfers voor de rapportjaren 2014 en 2020 hadden door een verwerkingsfout
        voor sommige cellen een foute schaal, waardoor de totalen ongeveer 1,1% (2014) en 0,6% (2020) te laag lagen. Het
        rapportjaar 2026 is ongewijzigd.
      </p>
    </aside>
  )
}
