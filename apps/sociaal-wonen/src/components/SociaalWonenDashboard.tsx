"use client"

import { useEffect, useMemo, useState } from "react"
import { Download } from "lucide-react"
import { buttonVariants } from "@embuild/shared/components/ui/button"
import { cn } from "@embuild/shared/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { getBasePath, getDataPath } from "@embuild/shared/lib/path-utils"
import { useJson } from "@/lib/data"
import { byGemeente, filterRows, sumRows } from "@/lib/filters"
import { fmtDate } from "@/lib/format"
import { normalizeAgainstData, parseState, toQuery } from "@/lib/url-state"
import { DEFAULT_STATE } from "@/lib/types"
import type { AggFile, Gemeente, Horizon, MapData, Meta, ProjectFile, State, Tab, Woonmaatschappij } from "@/lib/types"
import { DetailPanel } from "./DetailPanel"
import { EmbedShare } from "./EmbedShare"
import { FilterBar } from "./FilterBar"
import { HorizonSwitch } from "./HorizonSwitch"
import { PlanningTable } from "./PlanningTable"
import { ProjectTable } from "./ProjectTable"
import { SummaryTiles } from "./SummaryTiles"
import { WerkingsgebiedMap } from "./WerkingsgebiedMap"

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={o.v === value}
          onClick={() => onChange(o.v)}
          className={`rounded px-2.5 py-1 ${o.v === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

export function SociaalWonenDashboard({ section }: { section?: Tab }) {
  const embed = Boolean(section)
  const [raw, setRaw] = useState<State>({ ...DEFAULT_STATE, tab: section ?? DEFAULT_STATE.tab })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setRaw(parseState(window.location.search, section))
    setReady(true)
  }, [section])

  const meta = useJson<Meta>("meta.json")
  const wmsF = useJson<Woonmaatschappij[]>("woonmaatschappijen.json")
  const gemF = useJson<Gemeente[]>("gemeenten.json")
  const mapF = useJson<MapData>("map.json")
  const ktF = useJson<AggFile>("kt_aggregated.json")
  const ltF = useJson<AggFile>("lt_aggregated.json")

  // Privacy: projectdetails worden uitsluitend bij KT en enkel op de projectentab geladen.
  const wantProjects = ready && raw.horizon === "kt" && raw.tab === "projecten"
  const projF = useJson<ProjectFile>(wantProjects ? "kt_projects.json" : null)

  const wms = wmsF.data
  const gemeenten = gemF.data
  const procedures = useMemo(() => {
    const all = new Set<string>()
    for (const f of [ktF.data, ltF.data]) f?.rijen.forEach((r) => r.procedure && all.add(r.procedure))
    return Array.from(all).sort((a, b) => a.localeCompare(b, "nl", { numeric: true }))
  }, [ktF.data, ltF.data])
  const state = useMemo(
    () => (wms && gemeenten && ktF.data && ltF.data ? normalizeAgainstData(raw, wms, gemeenten, procedures) : raw),
    [raw, wms, gemeenten, procedures, ktF.data, ltF.data]
  )
  const set = (patch: Partial<State>) => setRaw((s) => ({ ...s, ...patch }))

  // URL gelijk houden met de filters (delen en terugkomen op dezelfde weergave)
  useEffect(() => {
    if (!ready) return
    const q = toQuery(state, { includeTab: !embed })
    const url = window.location.pathname + (q ? `?${q}` : "") + window.location.hash
    window.history.replaceState(null, "", url)
  }, [state, ready, embed])

  const error = [meta, wmsF, gemF, mapF, ktF, ltF].find((f) => f.error)?.error
  const data = ktF.data && ltF.data ? { kt: ktF.data, lt: ltF.data } : null

  const derived = useMemo(() => {
    if (!data) return null
    const rowsF = {} as Record<Horizon, ReturnType<typeof filterRows<AggFile["rijen"][number]>>>
    const rowsMap = {} as typeof rowsF
    const rowsPanel = {} as typeof rowsF
    const byNis = {} as Record<Horizon, ReturnType<typeof byGemeente>>
    for (const h of ["kt", "lt"] as Horizon[]) {
      rowsF[h] = filterRows(data[h].rijen, state)
      rowsMap[h] = filterRows(data[h].rijen, state, { ignoreGemeente: true })
      rowsPanel[h] = filterRows(data[h].rijen, state, { ignoreGemeente: true, ignoreWm: true })
      byNis[h] = byGemeente(rowsMap[h])
    }
    return { rowsF, rowsMap, rowsPanel, byNis }
  }, [data, state])

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        De gegevens konden niet geladen worden ({error}). Probeer de pagina te vernieuwen.
      </div>
    )
  }
  if (!meta.data || !wms || !gemeenten || !mapF.data || !data || !derived) {
    return <div className="p-6 text-sm text-muted-foreground" aria-busy="true">Gegevens laden…</div>
  }

  const m = meta.data
  const { rowsF, rowsMap, rowsPanel, byNis } = derived
  const horizon = state.horizon
  const current = rowsF[horizon]
  const totalsH = { kt: sumRows(rowsF.kt), lt: sumRows(rowsF.lt) }
  const totals = totalsH[horizon]
  const perGroep = {
    nieuwbouw: sumRows(current.filter((r) => r.groep === "nieuwbouw")),
    renovatie: sumRows(current.filter((r) => r.groep === "renovatie")),
  }
  const zonderGemeente = current.filter((r) => !r.nis).reduce((s, r) => s + r.huur, 0)
  const tab: Tab = section ?? (state.tab === "projecten" && horizon === "lt" ? "tabel" : state.tab)
  const showFilters = !embed || state.filters

  const kaart = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Meetwaarde" value={state.metric} onChange={(v) => set({ metric: v })} options={[{ v: "huur", l: "Huurwoningen" }, { v: "kostprijs", l: "Kostprijs" }]} />
      </div>
      <WerkingsgebiedMap
        map={mapF.data}
        gemeenten={gemeenten}
        wms={wms}
        data={byNis}
        horizon={horizon}
        modus="wm"
        metric={state.metric}
        wm={state.wm}
        selectedNis={state.gemeente}
        onSelectNis={(nis) => set({ gemeente: nis })}
        onSelectWm={(id) => set({ wm: id, gemeente: "" })}
      />
      <DetailPanel
        nis={state.gemeente}
        wmId={state.wm}
        gemeenten={gemeenten}
        wms={wms}
        types={m.types}
        rows={rowsPanel}
        onClear={() => set({ gemeente: "", wm: state.gemeente ? state.wm : "" })}
        onSelectWm={(id) => set({ wm: id })}
      />
    </div>
  )

  const tabel = (
    <PlanningTable
      rows={current}
      wms={wms}
      gemeenten={gemeenten}
      horizon={horizon}
      meta={m}
      onSelectNis={(nis) => set({ gemeente: nis, tab: embed ? state.tab : "kaart" })}
      onSelectWm={(id) => set({ wm: id })}
      pageSize={embed ? 25 : undefined}
    />
  )

  let projecten: React.ReactNode
  if (horizon !== "kt") {
    projecten = (
      <p className="rounded-md border p-4 text-sm text-muted-foreground">
        Projectdetails zijn enkel beschikbaar voor de korte termijnplanning. Voor de lange termijn tonen we cijfers per woonmaatschappij en gemeente, zie de tabel en de kaart.
      </p>
    )
  } else if (projF.error) {
    projecten = <p role="alert" className="text-sm">De projecten konden niet geladen worden ({projF.error}).</p>
  } else if (!projF.data) {
    projecten = <p className="p-4 text-sm text-muted-foreground" aria-busy="true">Projecten laden…</p>
  } else {
    const list = projF.data.projecten.filter((p) => {
      if (state.wm && p.wm !== state.wm) return false
      if (state.provincie && p.provincie !== state.provincie) return false
      if (state.gemeente && p.nis !== state.gemeente) return false
      if (state.groep && p.groep !== state.groep) return false
      if (state.type && p.type !== state.type) return false
      if (state.procedure && p.procedure !== state.procedure) return false
      return true
    })
    projecten = <ProjectTable projects={list} wms={wms} gemeenten={gemeenten} meta={m} pageSize={embed ? 25 : undefined} />
  }

  return (
    <div className="not-prose space-y-4 text-sm">
      {showFilters && <HorizonSwitch horizon={horizon} onChange={(h) => set({ horizon: h })} totals={totalsH} meta={m} />}
      {showFilters && <FilterBar state={state} set={set} wms={wms} gemeenten={gemeenten} meta={m} procedures={procedures} />}
      <SummaryTiles totals={totals} perGroep={perGroep} wmCount={new Set(current.map((r) => r.wm)).size} gemeenteCount={new Set(current.filter((r) => r.nis).map((r) => r.nis)).size} zonderGemeente={zonderGemeente} />

      {embed ? (
        <div>{tab === "kaart" ? kaart : tab === "tabel" ? tabel : projecten}</div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => set({ tab: v as Tab })}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="kaart">Kaart</TabsTrigger>
              <TabsTrigger value="tabel">Tabel</TabsTrigger>
              {horizon === "kt" && <TabsTrigger value="projecten">Projecten</TabsTrigger>}
            </TabsList>
            <div className="flex flex-wrap gap-2">
              <a href={getDataPath("/data/sociaal-wonen-alle-gegevens.xlsx")} download className={cn(buttonVariants({ variant: "outline", size: "sm" }), "no-underline")}>
                <Download className="mr-1.5 h-4 w-4" /> Download alle gegevens (xlsx)
              </a>
              <EmbedShare state={state} section={tab} />
            </div>
          </div>
          <div className="mt-3">{tab === "kaart" ? kaart : tab === "tabel" ? tabel : projecten}</div>
        </Tabs>
      )}

      {!embed && (
        <details className="rounded-lg border p-3 text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Over de cijfers</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Korte termijn (KT):</strong> verrichtingen die klaar zijn voor aanbesteding. <strong>Lange termijn (LT):</strong> verrichtingen waarvoor een voorontwerp werd geadviseerd.</li>
            <li><strong>Huurwoningen:</strong> aantal huurwoningen dat zal gerealiseerd worden. Bij renovatie gaat het om bestaande woningen waarvan de ingreep ook beperkt kan zijn (bv. raamcontracten of beperkte renovatie), dus het aantal woningen zegt daar weinig over de omvang van de werken. Vergelijk bedragen per woning daarom alleen binnen hetzelfde soort werken. <strong>Kostprijs:</strong> geraamde kostprijs van de werken. <strong>Max. prijs VMSW:</strong> FS4-plafond. <strong>Subsidiabel (UP):</strong> subsidiabel bedrag, berekend op basis van kostprijs en maximumprijs.</li>
            <li><strong>Types:</strong> {Object.entries(m.types).filter(([k]) => k !== "ONBEKEND").map(([k, v]) => `${k} = ${v.toLowerCase()}`).join("; ")}.</li>
            <li>De kaart toont het werkingsgebied van elke woonmaatschappij (stand januari 2025, afgeleid uit de kaart &quot;Woonmaatschappijen in kaart&quot;). De planning kan ook projecten buiten dat gebied bevatten. De tabel toont altijd de woonmaatschappij uit de planning.</li>
            <li>SSI-projecten (sociale initiatiefnemers) zijn niet inbegrepen, omdat ze overlappen met de gewone planning.</li>
          </ul>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        Bron: {m.bron}. Peildatum {fmtDate(m.peildatum)}.
        {embed && (
          <>
            {" "}
            <a className="underline underline-offset-2" href={getDataPath("/data/sociaal-wonen-alle-gegevens.xlsx")} download>
              Download alle gegevens (xlsx)
            </a>
            {" · "}
            <a className="underline underline-offset-2" href={`${window.location.origin}${getBasePath()}/`} target="_blank" rel="noopener noreferrer">
              Bekijk de volledige analyse
            </a>
          </>
        )}
      </p>
    </div>
  )
}
