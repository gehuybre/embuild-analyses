import { Badge } from "@embuild/shared/components/ui/badge"

const PREVIOUS_VERSION_URL = "/analyses/gemeentelijke-investeringen/"

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
      </div>
      <ul className="m-0 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          De beleidsdomeinen (BV) en de economische rekening (REK) zijn herberekend op de meerjarenplannen zoals ze in
          september 2026 uit de BBC-DR-gegevens zijn gehaald.
        </li>
        <li>
          De investeringsuitgaven omvatten terreinen en gebouwen, wegen en overige infrastructuur, erfgoed
          en toegestane investeringssubsidies. Financiële en immateriële vaste activa, roerende goederen, leasing en
          andere onroerende goederen (I.1.B.2.a) zijn in deze versie niet opgenomen. Daardoor zijn de totalen lager dan in de
          versie van mei 2026, vooral bij het beleidsveld Patrimonium zonder maatschappelijk doel. De REK toont enkel
          nog de categorieën materiële vaste activa en toegestane investeringssubsidies.
        </li>
      </ul>
    </aside>
  )
}
