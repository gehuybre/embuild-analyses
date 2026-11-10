import type { MarktwerkingData } from "./MarktwerkingExplorer"

const linkClass = "font-medium text-primary underline-offset-4 hover:underline"
const cell = "px-2 py-2 align-top"
const nf = (value: number) => new Intl.NumberFormat("nl-BE").format(value)

/** Uitklapblok met de studie, de gebruikte werkbladen, de indicatoren en de beperkingen. */
export function MarktwerkingInfo({ data }: { data: MarktwerkingData }) {
  const sheets = data.sheetInfo ?? []
  const years = data.marginYears
  const bouw = data.screening.filter((row) => row.group === "Bouw").length
  const materials = data.screening.length - bouw
  const screeningInfo = sheets.filter((item) => item.sheet.startsWith("SI_"))
  const totalSectors = screeningInfo.reduce((sum, item) => sum + item.total, 0)

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        Meer informatie: de studie, gebruikte werkbladen en beperkingen
      </summary>
      <div className="mt-4 space-y-6 text-sm leading-6 text-muted-foreground">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Over de studie</p>
          <p>
            <em>Marktwerking in België: horizontale screening van marktsectoren</em>, editie {data.edition}, van FOD
            Economie. De studie toetst alle Belgische marktsectoren op dezelfde zes indicatoren en rangschikt ze met een
            samengestelde indicator naar het risico op marktverstoring. Ze ondersteunt het Prijzenobservatorium, de
            regulatoren en de Belgische Mededingingsautoriteit. Resultaten voor referentiejaar t verschijnen in het voorjaar
            van t+2: deze editie gaat over {data.turnoverYear.screening}.
          </p>
          <ul className="space-y-1">
            <li>
              <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Publicatiepagina bij FOD Economie
              </a>
            </li>
            {data.sourceFiles?.map((file) => (
              <li key={file.url}>
                <a href={file.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {file.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs">
            De cijfers komen uit jaarrekeningen (NBB), btw-aangiften (Statbel), werkgelegenheidsgegevens (RSZ) en
            import- en exportstatistieken (NBB), volgens het methodologisch rapport.
          </p>
        </div>

        {sheets.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Gebruikte werkbladen uit de bijlage</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className={cell}>Werkblad</th>
                    <th className={cell}>Gebruik in de blog</th>
                    <th className={`${cell} text-right`}>Sectoren gebruikt</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((item) => (
                    <tr key={item.sheet} className="border-t">
                      <td className={`${cell} font-mono text-foreground`}>{item.sheet}</td>
                      <td className={cell}>{item.use}</td>
                      <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>
                        {nf(item.used)} van {nf(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs">
              De screening toont enkel de {bouw} bouwsectoren en de {materials} bouwmaterialen, uit in totaal{" "}
              {nf(totalSectors)} gescreende sectoren. De andere sectoren staan wel in de bijlage en in de Excel-download
              bij de evolutie van de marges.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Indicatoren en wanneer het risico hoger is</p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className={cell}>Indicator</th>
                  <th className={cell}>Risico hoger bij een</th>
                  <th className={cell}>Omschrijving (methodologisch rapport)</th>
                </tr>
              </thead>
              <tbody>
                {data.indicators.map((item) => (
                  <tr key={item.code} className="border-t">
                    <td className={`${cell} font-medium text-foreground`}>{item.label}</td>
                    <td className={`${cell} whitespace-nowrap`}>{item.riskWhen ? `${item.riskWhen}e waarde` : "-"}</td>
                    <td className={cell}>{item.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs">
            De rang is de plaats in de rangschikking van alle sectoren in dezelfde groep (dienstensectoren of industriële
            sectoren), met rang 1 als hoogste risico.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Selectie en bewerking</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Bouw: dienstensectoren met NACE-code 41, 42 en 43 (4 en 5 cijfers). Bouwmaterialen: industriële sectoren met NACE-code 23.</li>
            <li>Waarden en rangen worden onbewerkt overgenomen. Marges zijn omgerekend van fractie naar procent; de HHI blijft een index van 0 tot 1.</li>
            <li>Evolutie: {years[0]} t.e.m. {years[years.length - 1]}. Omzetten die om vertrouwelijkheid een bereik zijn (bijvoorbeeld "250 tot 475"), blijven als bereik staan.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Beperkingen</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Een hoog risico is een signaal om verder te onderzoeken, geen bewijs van een concurrentieprobleem. Een hogere concentratie kan ook komen door succesvolle, innovatieve bedrijven.</li>
            <li>Enkel commerciële sectoren met voldoende representativiteit en een waarde voor elke indicator zijn opgenomen. Landbouw, winningsindustrie en financiële activiteiten ontbreken.</li>
            <li>De nettomarge gebruikt een omzetdrempel van 30 procent en meet de totale rentabiliteit, dus inclusief export. Ze zegt niets over de waardeontwikkeling van bedrijfsresultaat of omzet.</li>
            <li>De samengestelde indicator telt elke indicator even zwaar mee; het aantal ondernemingen wordt eerst logaritmisch omgezet. Bij de industrie zijn er zes indicatoren, bij diensten vijf.</li>
          </ul>
        </div>
      </div>
    </details>
  )
}
