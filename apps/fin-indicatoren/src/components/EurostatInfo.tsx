import type { EurostatData } from "./EurostatExplorer"

const linkClass = "font-medium text-primary underline-offset-4 hover:underline"
const cell = "px-2 py-2 align-top"

function formatDate(value: string | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" })
}

const nf = (value: number) => new Intl.NumberFormat("nl-BE").format(value)

/** Uitklapblok met de gebruikte Eurostat-datasets, de variabelen en de bewerkingen. */
export function EurostatInfo({ data }: { data: EurostatData }) {
  const info = data.datasetInfo
  if (!info) return null
  const datasets = Object.entries(info)
  const national = (data.indicatorMap ?? []).filter((row) => row.scope === "Nationaal")
  const regional = (data.indicatorMap ?? []).filter((row) => row.scope === "Regionaal")

  const mappingTable = (rows: typeof national, title: string) => (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className={cell}>Naam in de blog</th>
              <th className={cell}>Eenheid</th>
              <th className={cell}>Tot en met {data.breakYear - 1}</th>
              <th className={cell}>Vanaf {data.breakYear}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code} className="border-t">
                <td className={`${cell} font-medium text-foreground`}>{row.label}</td>
                <td className={`${cell} whitespace-nowrap`}>{row.unit}</td>
                <td className={cell}>
                  <span className="mr-1 rounded bg-muted px-1 py-0.5 font-mono">{row.oldCode}</span>
                  {row.oldLabel}
                </td>
                <td className={cell}>
                  <span className="mr-1 rounded bg-muted px-1 py-0.5 font-mono">{row.newCode}</span>
                  {row.newLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Meer informatie: gebruikte datasets, variabelen en bewerkingen
      </summary>
      <div className="mt-4 space-y-6 text-sm leading-6 text-muted-foreground">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Gebruikte datasets ({datasets.length})</p>
          <p>
            Alle datasets komen uit de Eurostat-database onder <em>Structural business statistics (sbs)</em>. De cijfers worden
            via de{" "}
            <a href={data.apiGuideUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Eurostat-API
            </a>{" "}
            opgehaald, enkel voor België en enkel voor de bouw en de sectoren die hier getoond worden.
          </p>
          <ul className="space-y-3">
            {datasets.map(([code, item]) => (
              <li key={code} className="rounded-md border p-3">
                <p>
                  <a
                    href={`https://ec.europa.eu/eurostat/databrowser/view/${code}/default/table`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${linkClass} font-mono`}
                  >
                    {code}
                  </a>{" "}
                  <span className="text-foreground">{item.title}</span>
                </p>
                <p className="text-xs">{item.folder}</p>
                <p className="mt-1">{item.use}</p>
                <p className="mt-1 text-xs">
                  Gebruikt in: {item.views.join(", ")}. In onze selectie: {item.firstYear} t.e.m. {item.lastYear},{" "}
                  {nf(item.observations)} waarnemingen. Laatst bijgewerkt door Eurostat op {formatDate(item.updated)}.
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-foreground">Variabelen: onze naam en de Eurostat-codes</p>
          <p>
            Eurostat gebruikt tot en met {data.breakYear - 1} andere variabelen dan vanaf {data.breakYear}. We koppelen ze
            hieronder aan één naam. Waar de Eurostat-benaming verschilt (bijvoorbeeld <em>Turnover</em> en{" "}
            <em>Net turnover</em>), is de definitie niet noodzakelijk identiek: let daarop bij het vergelijken over de
            reeksbreuk heen.
          </p>
          {mappingTable(national, "Nationaal (subsectoren en sectoren)")}
          {mappingTable(regional, "Regionaal (vestigingen, geen ondernemingen)")}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Selectie en bewerking</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Nationaal: geo = BE. Bouw = NACE F met alle onderliggende codes (F41 tot F4399). Sectoren = NACE-secties B tot R en het totaal van de marktgerichte economie.</li>
            <li>Regionaal: Brussel (NUTS1 BE1, in NUTS2 BE10), Vlaanderen (BE2), Wallonië (BE3) en de tien provincies (NUTS2). Brussel wordt onder BE1 samengevoegd.</li>
            <li>Waarden worden onbewerkt overgenomen. Alleen de reeksen vóór en vanaf {data.breakYear} worden in de grafiek apart getekend. Eurostat-vlaggen staan in de Excel en de CSV.</li>
            <li>Het totaal van de marktgerichte economie heeft een andere afbakening vóór en vanaf {data.breakYear}.</li>
          </ul>
        </div>

        {data.notUsed && data.notUsed.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Beschikbaar bij Eurostat maar niet gebruikt</p>
            <ul className="space-y-1">
              {data.notUsed.map((item) => (
                <li key={item.code}>
                  <a
                    href={`https://ec.europa.eu/eurostat/databrowser/view/${item.code}/default/table`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${linkClass} font-mono`}
                  >
                    {item.code}
                  </a>
                  : {item.title}. <span className="text-xs">{item.why}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  )
}
