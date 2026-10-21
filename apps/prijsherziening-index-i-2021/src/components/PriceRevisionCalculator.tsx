"use client"

import * as React from "react"
import { Calculator } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Input } from "@embuild/shared/components/ui/input"
import { Label } from "@embuild/shared/components/ui/label"
import { getLocalPublicPath } from "@embuild/shared/lib/path-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { findLaborIndex, findMaterialIndex, laborStart, laborEnd, type LaborIndex, type MaterialIndex } from "@/lib/price-revision"

const SOURCE = "https://economie.fgov.be/nl/themas/ondernemingen/specifieke-sectoren/bouw/prijsherzieningsindexen"
const WORKBOOK = "https://economie.fgov.be/sites/default/files/Files/Entreprises/prix-construction-Indice-I-2021.xlsx"
const HISTORY = "https://economie.fgov.be/sites/default/files/Files/Entreprises/prijzen-bouw-waarden-S-s-Historiek.pdf"
const REGIME = "offerten vanaf 11/06/2007"
const CATEGORIES = [
  { code: "A", description: "Maritieme- en rivierwerken, grondwerken, wegenwerken en betonwerken, baggerwerken, asfalterings- en bitumenwerken", rsz: "24" },
  { code: "B", description: "Dakbedekkingswerken en opvoegen van gevels", rsz: "54" },
  { code: "C", description: "Bevloerings-, plafonnerings- en bepleisteringswerken", rsz: "44" },
  { code: "D", description: "Andere werken", rsz: "26" },
]
const SIZES = [
  { value: "<10 werklieden", label: "Minder dan 10 werknemers" },
  { value: "10-20 werklieden", label: "10 tot en met 20 werknemers" },
  { value: ">20 werklieden", label: "Meer dan 20 werknemers" },
]
const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
const linkClass = "underline underline-offset-2"

function dateLabel(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("nl-BE")
}

function monthKey(row: MaterialIndex): string {
  return `${row.year}-${String(row.month).padStart(2, "0")}`
}

function monthLabel(row: MaterialIndex): string {
  return new Date(row.year, row.month - 1, 1).toLocaleDateString("nl-BE", { month: "long", year: "numeric" })
}

function LaborSource({ row, initial }: { row: LaborIndex | undefined; initial: boolean }) {
  if (!row) return null
  const start = laborStart(row, initial)
  const end = laborEnd(row, initial)
  return (
    <p className="text-xs text-muted-foreground">
      {start ? `Geldig vanaf ${dateLabel(start)}` : ""}
      {end ? ` t.e.m. ${dateLabel(end)}` : ""} · Omzendbrief {row.circular}
      {row.source_pdf && row.source_page ? (
        <> · <a className={linkClass} href={`${getLocalPublicPath(row.source_pdf)}#page=${row.source_page}`} target="_blank" rel="noopener noreferrer">
          Controleer in PDF (p. {row.source_page})
        </a></>
      ) : (
        <> · <a className={linkClass} href={HISTORY} target="_blank" rel="noopener noreferrer">Historische PDF</a>
          {" "}(paginaverwijzing nog niet beschikbaar)</>
      )}
    </p>
  )
}

export function PriceRevisionCalculator({ monthlyData }: { monthlyData: MaterialIndex[] }) {
  const { data, loading, error } = useJsonBundle<{ labor: LaborIndex[] }>({ labor: "/data/labor_indices.json" })
  const [size, setSize] = React.useState(SIZES[0].value)
  const [category, setCategory] = React.useState("D")
  const [initialDate, setInitialDate] = React.useState("")
  const [revisionDate, setRevisionDate] = React.useState("")
  const [price, setPrice] = React.useState("100000")
  const [laborShare, setLaborShare] = React.useState("0.40")
  const [materialShare, setMaterialShare] = React.useState("0.40")
  const [fixedShare, setFixedShare] = React.useState("0.20")

  const laborRows = React.useMemo(
    () => (data?.labor ?? []).filter(row => row.regime === REGIME
      && (row.employer_size === size || (size !== "<10 werklieden" && row.employer_size === ">=10 werklieden"))
      && row.category === category)
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date)),
    [data, size, category]
  )
  const materialRows = React.useMemo(
    () => monthlyData.filter(row => row.component === "Index I-2021")
      .sort((a, b) => monthKey(a).localeCompare(monthKey(b))),
    [monthlyData]
  )
  const S = findLaborIndex(laborRows, initialDate, true)
  const s = findLaborIndex(laborRows, revisionDate, false)
  const I = findMaterialIndex(materialRows, initialDate)
  const i = findMaterialIndex(materialRows, revisionDate)
  const P0 = Number(price)
  const shares = [laborShare, materialShare, fixedShare].map(Number)
  let validation = ""
  if (!initialDate || !revisionDate) validation = "Kies een aanvangsdatum en een herzieningsdatum om te berekenen."
  else if (initialDate < "2007-06-11") validation = "Deze calculator is alleen voor offerten vanaf 11/06/2007."
  else if (revisionDate < initialDate) validation = "De herzieningsdatum mag niet vóór de aanvangsdatum liggen."
  else if (!S || !s) validation = "Voor een gekozen datum is geen geldige S/s-waarde beschikbaar. Controleer de datums en de beschikbare bronperiodes."
  else if (!I || !i) validation = "Voor een gekozen maand is I-2021 nog niet gepubliceerd of niet beschikbaar. Er wordt geen oudere maand als vervanging gebruikt."
  else if (!price.trim() || !Number.isFinite(P0) || P0 <= 0) validation = "Vul een contractprijs groter dan nul in."
  else if ([laborShare, materialShare, fixedShare].some(value => !value.trim()) || shares.some(value => !Number.isFinite(value) || value < 0 || value > 1)) validation = "Vul voor elk aandeel een getal tussen 0 en 1 in."
  else if (Math.abs(shares.reduce((sum, value) => sum + value, 0) - 1) > 0.000001) validation = "De aandelen lonen, materialen en vast deel moeten samen 1 zijn."
  else if ([S.value, s.value, I.value, i.value].some(value => !Number.isFinite(value) || value <= 0)) validation = "Een geselecteerde indexwaarde is ongeldig."
  const computedPrice = !validation && S && s && I && i
    ? P0 * (shares[0] * s.value / S.value + shares[1] * i.value / I.value + shares[2])
    : null
  if (computedPrice !== null && !Number.isFinite(computedPrice)) validation = "Het berekende bedrag is te groot. Controleer de contractprijs."
  const revisedPrice = validation ? null : computedPrice

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />Prijsherzieningscalculator</CardTitle>
        <CardDescription>Bereken met de officiële S/s-waarden en de materiaalprijsindex I-2021 van FOD Economie.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Alleen voor {REGIME}. Kies de aanvangsdatum, herzieningsdatum en aandelen zoals bepaald in uw contract.
          S/s omvat lonen, sociale lasten en verzekeringen; I/i gebruikt uitsluitend de reeks I-2021.
          {" "}<a className={linkClass} href={SOURCE} target="_blank" rel="noopener noreferrer">Meer informatie bij FOD Economie</a>.
        </p>
        {loading ? <p role="status">S/s-waarden laden...</p> : error ? (
          <p role="alert" className="text-sm text-destructive">S/s-waarden konden niet worden geladen: {error}</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employerSize">Aantal werknemers (werklieden)</Label>
                <select id="employerSize" className={selectClass} value={size} onChange={event => setSize(event.target.value)}>
                  {SIZES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workCategory">Categorie</Label>
                <select id="workCategory" className={selectClass} value={category} onChange={event => setCategory(event.target.value)}>
                  {CATEGORIES.map(option => <option key={option.code} value={option.code}>Categorie {option.code} (RSZ {option.rsz})</option>)}
                </select>
              </div>
            </div>
            <details className="rounded-md border p-3 text-sm" open>
              <summary className="cursor-pointer font-medium">Toelichting categorieën</summary>
              <ul className="mt-2 space-y-2">
                {CATEGORIES.map(option => <li key={option.code}><strong>Categorie {option.code}:</strong> {option.description} [RSZ-kencijfer {option.rsz}].</li>)}
              </ul>
            </details>
            <div className="space-y-2">
              <Label htmlFor="initialPrice">Initiële contractprijs (P₀)</Label>
              <Input id="initialPrice" type="number" min="0" value={price} onChange={event => setPrice(event.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { id: "initialDate", label: "Aanvangsdatum", value: initialDate, setValue: setInitialDate },
                { id: "revisionDate", label: "Herzieningsdatum", value: revisionDate, setValue: setRevisionDate },
              ].map(field => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id}>{field.label}</Label>
                  <Input id={field.id} type="date" min="2007-06-11" value={field.value} onChange={event => field.setValue(event.target.value)} />
                </div>
              ))}
              {[
                { label: "Loonwaarde bij aanvang (S)", row: S, initial: true, date: initialDate },
                { label: "Loonwaarde bij herziening (s)", row: s, initial: false, date: revisionDate },
              ].map(field => (
                <div key={field.label} className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">{field.label}</p>
                  <p>{field.row ? field.row.value.toLocaleString("nl-BE", { minimumFractionDigits: 3 }) : field.date ? "Geen geldige waarde beschikbaar" : "Kies een datum"}</p>
                  <LaborSource row={field.row} initial={field.initial} />
                </div>
              ))}
              {[
                { label: "Materiaalprijsindex bij aanvang (I)", row: I, date: initialDate },
                { label: "Materiaalprijsindex bij herziening (i)", row: i, date: revisionDate },
              ].map(field => (
                <div key={field.label} className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">{field.label}</p>
                  <p>{field.row ? `${field.row.value.toLocaleString("nl-BE", { minimumFractionDigits: 2 })} · ${monthLabel(field.row)}` : field.date ? "Geen I-2021 beschikbaar voor deze maand" : "Kies een datum"}</p>
                  {field.row && <p className="text-xs text-muted-foreground">
                    <a className={linkClass} href={WORKBOOK} target="_blank" rel="noopener noreferrer">Controleer I-2021 in het officiële Excelbestand</a> (tabblad I_2021 (Nl)).
                  </p>}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              S/s: {laborRows.length ? `${dateLabel(laborRows[0].effective_date)} – ${dateLabel(laborRows[laborRows.length - 1].effective_date)}` : "geen waarden beschikbaar"}.
              {" "}I-2021: {materialRows.length ? `${monthLabel(materialRows[0])} – ${monthLabel(materialRows[materialRows.length - 1])}` : "geen waarden beschikbaar"}.
              {" "}De reeksen worden afzonderlijk gepubliceerd; een recentere S/s-waarde betekent niet dat I-2021 voor diezelfde maand al beschikbaar is.
              {" "}De loonwaarde volgt de geldigheidsperiode uit de PDF; voor S geldt de afzonderlijke ingangsdatum voor aanbestedingen. I-2021 komt uit de maand van de gekozen datum.
              {size !== "<10 werklieden" && " Vóór 2011 gebruikt de bron één gezamenlijke klasse voor werkgevers met 10 of meer werklieden."}
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { id: "laborShare", label: "Aandeel lonen", value: laborShare, setValue: setLaborShare },
                { id: "materialShare", label: "Aandeel materialen", value: materialShare, setValue: setMaterialShare },
                { id: "fixedShare", label: "Vast deel", value: fixedShare, setValue: setFixedShare },
              ].map(field => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id}>{field.label}</Label>
                  <Input id={field.id} type="number" min="0" max="1" step="0.01" value={field.value} onChange={event => field.setValue(event.target.value)} />
                </div>
              ))}
            </div>
            {validation && <p role="status" className="text-sm text-muted-foreground">{validation}</p>}
            {revisedPrice !== null && (
              <div aria-live="polite" className="rounded-lg bg-muted p-4 space-y-2">
                <p className="flex justify-between items-center gap-2"><strong>Herziene prijs (P):</strong>
                  <span className="text-2xl font-bold">€ {revisedPrice.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </p>
                <p className="text-sm">Verschil: € {(revisedPrice - P0).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {" "}({((revisedPrice / P0 - 1) * 100).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)</p>
                <p className="text-xs text-muted-foreground">Gebruikte waarden: S = {S?.value}; s = {s?.value}; I = {I?.value}; i = {i?.value}.</p>
              </div>
            )}
          </>
        )}
        <div className="rounded-lg border bg-muted p-4 text-sm space-y-2">
          <p className="font-medium">Formule</p>
          <p className="font-mono text-xs">P = P₀ × ({laborShare} × s/S + {materialShare} × i/I + {fixedShare})</p>
          <p className="text-xs text-muted-foreground">s/S = verhouding loonwaarden (herziening/aanvang); i/I = verhouding materiaalprijsindexen (herziening/aanvang). De aandelen 0,40 / 0,40 / 0,20 zijn een voorbeeld: neem de coëfficiënten en referentieperiodes uit uw contract over.</p>
        </div>
      </CardContent>
    </Card>
  )
}
