"use client"

import * as React from "react"
import { Calculator, Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Input } from "@embuild/shared/components/ui/input"
import { Label } from "@embuild/shared/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@embuild/shared/components/ui/command"
import { getLocalPublicPath } from "@embuild/shared/lib/path-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { CalculatorDateInput } from "./CalculatorDateInput"
import {
  calculateRevision, findLaborIndex, findMaterialObservation, laborStart, laborEnd,
  liveMaterialSeries, previousMaterialMonth, type LaborIndex, type MaterialIndex,
  type MaterialSeries, type MaterialSnapshot,
  LABOR_REGIME as REGIME, LABOR_CATEGORIES as CATEGORIES, LABOR_SIZES as SIZES, matchesLaborSize,
} from "@/lib/price-revision"

const SOURCE = "https://economie.fgov.be/nl/themas/ondernemingen/specifieke-sectoren/bouw/prijsherzieningsindexen"
const HISTORY = "https://economie.fgov.be/sites/default/files/Files/Entreprises/prijzen-bouw-waarden-S-s-Historiek.pdf"
const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
const linkClass = "underline underline-offset-2"

function dateLabel(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("nl-BE")
}

function monthLabel(value: string): string {
  return new Date(`${value.slice(0, 7)}-01T12:00:00`).toLocaleDateString("nl-BE", { month: "long", year: "numeric" })
}

function numericInput(value: string): number {
  return value.trim() ? Number(value) : NaN
}

function pct(value: number, digits = 2): string {
  return value.toLocaleString("nl-BE", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function MaterialPicker({ value, series, onChange, label }: {
  value: string; series: MaterialSeries[]; onChange: (value: string) => void; label: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = series.find(row => row.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={label}
          className="h-auto min-h-10 w-full justify-between whitespace-normal text-left">
          <span>{selected?.label ?? "Kies een materiaal of index"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(90vw,32rem)] p-0">
        <Command>
          <CommandInput placeholder="Zoek cement, hout, staal, OW-code..." aria-label="Materiaal zoeken" />
          <CommandList>
            <CommandEmpty>Geen materiaal gevonden.</CommandEmpty>
            {[...new Set(series.map(row => row.group))].map(group => (
              <CommandGroup key={group} heading={group}>
                {series.filter(row => row.group === group).map(row => (
                  <CommandItem key={row.id} value={`${row.id} ${row.label}`} onSelect={() => { onChange(row.id); setOpen(false) }}>
                    <Check className={`mr-2 h-4 w-4 shrink-0 ${value === row.id ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
                    {row.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
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
  const snapshot = useJsonBundle<{ materials: MaterialSnapshot }>({ materials: "/data/revtool_materials.json" })
  const [size, setSize] = React.useState(SIZES[0].value)
  const [category, setCategory] = React.useState("D")
  const [initialDate, setInitialDate] = React.useState("")
  const [revisionDate, setRevisionDate] = React.useState("")
  const [price, setPrice] = React.useState("100000")
  const [laborShare, setLaborShare] = React.useState("40")
  const [materialShare, setMaterialShare] = React.useState("40")
  const [basket, setBasket] = React.useState([{ key: 0, id: "Index I-2021", weight: "100" }])
  const nextKey = React.useRef(1)

  const laborRows = React.useMemo(
    () => (data?.labor ?? []).filter(row => row.regime === REGIME
      && matchesLaborSize(row, size)
      && row.category === category)
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date)),
    [data, size, category]
  )
  const materialSeries = React.useMemo(() => [
    ...liveMaterialSeries(monthlyData), ...(snapshot.data?.materials.series ?? []),
  ], [monthlyData, snapshot.data])
  const initialMonth = previousMaterialMonth(initialDate)
  const revisionMonth = previousMaterialMonth(revisionDate)
  const S = findLaborIndex(laborRows, initialDate, true)
  const s = findLaborIndex(laborRows, revisionDate, false)
  const P0 = numericInput(price)
  const a = numericInput(laborShare) / 100
  const b = numericInput(materialShare) / 100
  const remainder = 1 - a - b
  const fixedShare = Math.abs(remainder) < 1e-10 ? 0 : remainder
  const selectedMaterials = basket.map(row => {
    const series = materialSeries.find(item => item.id === row.id)
    return {
      ...row, series,
      initial: series ? findMaterialObservation(series, initialMonth) : undefined,
      revision: series ? findMaterialObservation(series, revisionMonth) : undefined,
    }
  })
  const calculation = calculateRevision({
    price: P0, laborShare: a, materialShare: b, initialLabor: S?.value, revisionLabor: s?.value,
    materials: selectedMaterials.map(row => ({
      id: row.id, label: row.series?.label ?? "Materiaal", weight: numericInput(row.weight) / 100,
      initial: row.initial?.value, revision: row.revision?.value,
    })),
  })
  let validation = ""
  if (!initialDate || !revisionDate) validation = "Kies een aanvangsdatum en een herzieningsdatum om te berekenen."
  else if (initialDate < "2007-06-11") validation = "Deze calculator is alleen voor offerten vanaf 11/06/2007."
  else if (!initialMonth || !revisionMonth) validation = "Vul twee geldige datums in."
  else if (revisionDate < initialDate) validation = "De herzieningsdatum mag niet vóór de aanvangsdatum liggen."
  else if (b > 0 && selectedMaterials.some(row => !row.series)) validation = "Kies voor elke regel een beschikbare materiaalreeks of verwijder de regel."
  else if (!calculation.ok) validation = calculation.error
  const result = !validation && calculation.ok ? calculation : null
  const basketTotal = basket.reduce((sum, row) => sum + numericInput(row.weight), 0)
  const updateMaterial = (key: number, update: Partial<{ id: string; weight: string }>) =>
    setBasket(rows => rows.map(row => row.key === key ? { ...row, ...update } : row))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />Prijsherzieningscalculator</CardTitle>
        <CardDescription>Bereken met S/s en I-2021, of stel optioneel uw eigen materiaalmandje samen.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Alleen voor {REGIME}. Kies de aanvangsdatum, herzieningsdatum en aandelen zoals bepaald in uw contract.
          S/s omvat lonen, sociale lasten en verzekeringen. Standaard gebruiken we I-2021 voor materialen.
          {" "}<a className={linkClass} href={SOURCE} target="_blank" rel="noopener noreferrer">Meer informatie bij FOD Economie</a>.
        </p>
        <p className="rounded-md border p-3 text-sm">
          Nieuw: de materiaalreferentie is automatisch de <strong>maand vóór de gekozen datum</strong>, zoals in Revtool.
          Voorheen gebruikte deze calculator de gekozen kalendermaand. De S/s-regels uit de officiële PDF blijven behouden.
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
              <Input id="initialPrice" type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { id: "initialDate", label: "Aanbestedings- / contractdatum", value: initialDate, setValue: setInitialDate },
                { id: "revisionDate", label: "Herzieningsdatum", value: revisionDate, setValue: setRevisionDate },
              ].map(field => (
                <CalculatorDateInput key={field.id} label={field.label} value={field.value} onChange={field.setValue} />
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
            </div>
            <p className="text-xs text-muted-foreground">
              S/s: {laborRows.length ? `${dateLabel(laborRows[0].effective_date)} – ${dateLabel(laborRows[laborRows.length - 1].effective_date)}` : "geen waarden beschikbaar"}.
              {" "}S gebruikt de afzonderlijke ingangsdatum voor aanbestedingen; we trekken niet nogmaals tien dagen af.
              {size !== "<10 werklieden" && " Vóór 2011 gebruikt de bron één gezamenlijke klasse voor werkgevers met 10 of meer werklieden."}
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { id: "laborShare", label: "Aandeel lonen (%)", value: laborShare, setValue: setLaborShare },
                { id: "materialShare", label: "Aandeel materialen (%)", value: materialShare, setValue: setMaterialShare },
              ].map(field => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id}>{field.label}</Label>
                  <Input id={field.id} type="number" min="0" max="100" step="0.01" value={field.value} onChange={event => field.setValue(event.target.value)} />
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="fixedShare">Vast deel (%) — automatisch</Label>
                <Input id="fixedShare" readOnly value={Number.isFinite(fixedShare) ? pct(100 * fixedShare) : ""} />
              </div>
            </div>
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Materiaalsamenstelling aanpassen — {basket.length === 1 && basket[0].id === "Index I-2021" ? "standaard I-2021" : `${basket.length} materiaalreeksen`}
              </summary>
              <div className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">Verdeel alleen het materiaalaandeel over de onderstaande reeksen. De gewichten binnen dit mandje moeten samen 100% zijn. Er worden geen contractgewichten voorgeschreven.</p>
                {snapshot.loading && <p role="status" className="text-sm">Extra materiaalreeksen laden...</p>}
                {snapshot.error && <p role="alert" className="text-sm text-destructive">Extra materiaalreeksen konden niet worden geladen: {snapshot.error}. De FOD-reeksen blijven beschikbaar.</p>}
                {basket.map((row, index) => (
                  <div key={row.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Materiaal {index + 1}</p>
                      <MaterialPicker value={row.id} series={materialSeries} label={`Materiaal ${index + 1}`} onChange={id => updateMaterial(row.key, { id })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`weight-${row.key}`}>Gewicht (%)</Label>
                      <Input id={`weight-${row.key}`} type="number" min="0" max="100" step="0.01" value={row.weight} onChange={event => updateMaterial(row.key, { weight: event.target.value })} />
                    </div>
                    <Button type="button" variant="ghost" className="self-end" disabled={basket.length === 1} aria-label={`Materiaal ${index + 1} verwijderen`}
                      onClick={() => setBasket(rows => rows.filter(item => item.key !== row.key))}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" onClick={() => {
                    const material = { key: nextKey.current++, id: "", weight: "0" }
                    setBasket(rows => [...rows, material])
                  }}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Materiaal toevoegen
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setBasket([{ key: nextKey.current++, id: "Index I-2021", weight: "100" }])}>Herstel I-2021</Button>
                  <p className="text-sm" role="status">Totaal mandje: {Number.isFinite(basketTotal) ? pct(basketTotal) : "—"}%</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  O.W. en Grymafer zijn opgeslagen Revtool-waarden, geen live bron. O.W. is beperkt tot december 2023 en later wegens de publicatiewijziging.
                  Weekreeksen, prognoses en sectorlonen zijn niet opgenomen.
                </p>
              </div>
            </details>
            <p className="text-sm">
              Materiaalreferenties: {initialMonth ? monthLabel(initialMonth) : "kies een contractdatum"} → {revisionMonth ? monthLabel(revisionMonth) : "kies een herzieningsdatum"}.
            </p>
            {validation && <p role="status" className="text-sm text-muted-foreground">{validation}</p>}
            {result && (
              <div aria-live="polite" className="rounded-lg bg-muted p-4 space-y-2">
                <p className="flex justify-between items-center gap-2"><strong>Herziene prijs (P):</strong>
                  <span className="text-2xl font-bold">€ {pct(result.revisedPrice)}</span>
                </p>
                <p className="text-sm">Verschil: € {pct(result.difference)} ({pct(100 * (result.factor - 1), 3)}%)</p>
              </div>
            )}
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Berekening en bronnen</summary>
              <div className="mt-3 space-y-3 text-sm">
                <p>Materiaalreferenties gebruiken de voorafgaande maand. Geen interpolatie of vervanging door oudere maanden.</p>
                <p>S = {S?.value.toLocaleString("nl-BE", { minimumFractionDigits: 3 }) ?? "niet beschikbaar"}; s = {s?.value.toLocaleString("nl-BE", { minimumFractionDigits: 3 }) ?? "niet beschikbaar"}. {a === 0 && "Lonen tellen niet mee (0%)."}</p>
                <LaborSource row={S} initial /><LaborSource row={s} initial={false} />
                {selectedMaterials.map(row => (
                  <div key={row.key} className="space-y-1 border-t pt-2">
                    <p className="font-medium">{row.series?.label ?? "Nog geen materiaal gekozen"}</p>
                    <p>{initialMonth ? monthLabel(initialMonth) : "Aanvang"}: {row.initial?.value.toLocaleString("nl-BE", { maximumFractionDigits: 6 }) ?? "niet beschikbaar"}
                      {" "}→ {revisionMonth ? monthLabel(revisionMonth) : "Herziening"}: {row.revision?.value.toLocaleString("nl-BE", { maximumFractionDigits: 6 }) ?? "niet beschikbaar"}.</p>
                    {row.series && <>
                      <p className="text-xs text-muted-foreground">{row.series.note}</p>
                      <a className={linkClass} href={row.series.source_url} target="_blank" rel="noopener noreferrer">Controleer de bron</a>
                      {row.series.sheet && <p className="text-xs text-muted-foreground">
                        {snapshot.data?.materials.source_workbook} · werkblad {row.series.sheet} · tabel {row.series.table} · cellen {row.initial?.cell ?? "—"} / {row.revision?.cell ?? "—"}.
                        {" "}Momentopname: {snapshot.data?.materials.snapshot_date}.
                      </p>}
                    </>}
                  </div>
                ))}
                {result && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <caption className="mb-2 text-left font-medium">Bijdrage aan de prijsherziening</caption>
                      <thead><tr><th scope="col" className="p-2">Component</th><th scope="col" className="p-2">Aandeel totale prijs</th><th scope="col" className="p-2">Verandering</th><th scope="col" className="p-2">Bijdrage (procentpunt)</th></tr></thead>
                      <tbody>{result.contributions.map(row => (
                        <tr key={row.id}><th scope="row" className="p-2 font-normal">{row.label}</th><td className="p-2">{pct(100 * row.share)}%</td><td className="p-2">{pct(100 * row.change, 3)}%</td><td className="p-2">{pct(row.percentagePoints, 5)}</td></tr>
                      ))}
                        <tr><th scope="row" className="p-2 font-normal">Vast deel</th><td className="p-2">{pct(100 * result.fixedShare)}%</td><td className="p-2">0%</td><td className="p-2">0</td></tr>
                        <tr><th scope="row" className="p-2 font-normal">Afronding resultaatfactor</th><td /><td /><td className="p-2">{pct(result.roundingPercentagePoints, 5)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Zoals in Revtool: veranderingen per index en de resultaatfactor worden op vijf decimalen afgerond, het bedrag op twee.
                  De som van aandelen lonen en materialen mag niet boven 100% uitkomen. De standaard 40/40/20 is een voorbeeld, geen contractadvies.
                </p>
              </div>
            </details>
          </>
        )}
        <div className="rounded-lg border bg-muted p-4 text-sm space-y-2">
          <p className="font-medium">Formule</p>
          <p className="font-mono text-xs">P = P₀ × (a × s/S + b × Σ(xⱼ × iⱼ/Iⱼ) + c)</p>
          <p className="text-xs text-muted-foreground">a = loonaandeel; b = materiaalaandeel; xⱼ = gewicht binnen het materiaalmandje (samen 100%); c = 1 − a − b. Neem de aandelen, reeksen en toepassingsregels uit uw contract over. Dit is een rekenhulpmiddel, geen juridisch advies.</p>
        </div>
      </CardContent>
    </Card>
  )
}
