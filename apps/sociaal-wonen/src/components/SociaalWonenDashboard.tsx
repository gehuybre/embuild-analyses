"use client"

import { useEffect, useMemo, useState } from "react"
import { Download } from "lucide-react"
import { buttonVariants } from "@embuild/shared/components/ui/button"
import { cn } from "@embuild/shared/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { getBasePath, getDataPath } from "@embuild/shared/lib/path-utils"
import { useJson } from "@/lib/data"
import { filterRows } from "@/lib/filters"
import { fmtDate } from "@/lib/format"
import { normalizeAgainstData, parseState, toQuery } from "@/lib/url-state"
import { DEFAULT_STATE } from "@/lib/types"
import type { AggFile, Gemeente, Horizon, MapData, Meta, State, Tab, Woonmaatschappij } from "@/lib/types"
import { EmbedShare } from "./EmbedShare"
import { FilterBar } from "./FilterBar"
import { OverzichtHistogram } from "./OverzichtHistogram"
import { PlanningContext } from "./PlanningContext"
import { PlanningTable } from "./PlanningTable"
import { PlanningMap } from "./PlanningMap"
import { SelectionDetails } from "./SelectionDetails"
import { VerrichtingenTable } from "./VerrichtingenTable"

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
  const ktF = useJson<AggFile>("kt_verrichtingen.json")
  const ltF = useJson<AggFile>("lt_verrichtingen.json")
  const ktAggregatedF = useJson<AggFile>("kt_aggregated.json")
  const ltAggregatedF = useJson<AggFile>("lt_aggregated.json")

  const wms = wmsF.data
  const gemeenten = gemF.data
  const state = useMemo(
    () => (wms && gemeenten ? normalizeAgainstData(raw, wms, gemeenten) : raw),
    [raw, wms, gemeenten]
  )
  const set = (patch: Partial<State>) => setRaw((s) => ({ ...s, ...patch }))

  useEffect(() => {
    if (!ready) return
    const q = toQuery(state, { includeTab: !embed })
    const url = window.location.pathname + (q ? `?${q}` : "") + window.location.hash
    window.history.replaceState(null, "", url)
  }, [state, ready, embed])

  const error = [meta, wmsF, gemF, mapF, ktF, ltF, ktAggregatedF, ltAggregatedF].find((f) => f.error)?.error
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        De gegevens konden niet geladen worden ({error}). Probeer de pagina te vernieuwen.
      </div>
    )
  }
  if (!meta.data || !wms || !gemeenten || !mapF.data || !ktF.data || !ltF.data || !ktAggregatedF.data || !ltAggregatedF.data) {
    return <div className="p-6 text-sm text-muted-foreground" aria-busy="true">Gegevens laden…</div>
  }

  const m = meta.data
  const records: Record<Horizon, AggFile> = { kt: ktF.data, lt: ltF.data }
  const data: Record<Horizon, AggFile> = { kt: ktAggregatedF.data, lt: ltAggregatedF.data }
  const currentRows = filterRows(data[state.horizon].rijen, state)
  const mapRows = {
    kt: filterRows(records.kt.rijen, state, { ignoreGemeente: true }),
    lt: filterRows(records.lt.rijen, state, { ignoreGemeente: true }),
  }
  const tab = section ?? (state.tab === "projecten" && state.horizon === "lt" ? "tabel" : state.tab)
  const showFilters = !embed || state.filters
  const horizon = state.horizon

  const kaart = (
    <div className="space-y-3">
      <PlanningMap
        map={mapF.data}
        rows={mapRows}
        gemeenten={gemeenten}
        wms={wms}
        horizon={horizon}
        metric="huur"
        meta={m}
        wm={state.wm}
        selectedNis={state.gemeente}
        onSelectNis={(nis) => set({ gemeente: nis, wm: "" })}
        onSelectWm={(wm) => set({ wm, gemeente: "" })}
      />
      <SelectionDetails
        nis={state.gemeente}
        wmId={state.wm}
        gemeenten={gemeenten}
        wms={wms}
        rows={mapRows}
        onClear={() => set({ gemeente: "", wm: "" })}
        onSelectWm={(wm) => set({ wm, gemeente: "" })}
      />
    </div>
  )

  const tabel = (
    <PlanningTable
      rows={currentRows}
      wms={wms}
      gemeenten={gemeenten}
      horizon={horizon}
      meta={m}
      pageSize={embed ? 25 : undefined}
      onSelectNis={(nis) => set({ gemeente: nis, tab: embed ? state.tab : "kaart" })}
      onSelectWm={(wm) => set({ wm, gemeente: "", tab: embed ? state.tab : "kaart" })}
    />
  )
  const projects = horizon === "lt" ? (
    <p className="rounded-md border p-4 text-sm text-muted-foreground">
      De afzonderlijke verrichtingen zijn hier beschikbaar voor de korte termijn. De meerjarenplanning blijft beschikbaar via de tabel en kaart.
    </p>
  ) : (
    <VerrichtingenTable
      rows={filterRows(records.kt.rijen, state)}
      wms={wms}
      gemeenten={gemeenten}
      horizon="kt"
      meta={m}
      pageSize={embed ? 25 : undefined}
      onSelectNis={(nis) => set({ gemeente: nis, tab: embed ? state.tab : "kaart" })}
      onSelectWm={(wm) => set({ wm, gemeente: "", tab: embed ? state.tab : "kaart" })}
    />
  )
  const planningFilter = showFilters && (
    <Segmented label="Planning" value={horizon} onChange={(h) => set({ horizon: h })} options={[
      { v: "kt", l: "Korte termijn" },
      { v: "lt", l: "Meerjarenplanning" },
    ]} />
  )

  const horizonBlock = (
    <div className="space-y-4">
      {showFilters && <FilterBar state={state} set={set} wms={wms} gemeenten={gemeenten} />}
      {(!embed || tab === "overzicht") && (
        <OverzichtHistogram
          rows={filterRows(records[horizon].rijen, state)}
          meta={m}
          horizonLabel={m.horizons[horizon].label}
          action={embed ? undefined : <EmbedShare state={state} section="overzicht" />}
        />
      )}
      {embed ? (
        tab === "overzicht" ? null : <div className="space-y-3">{tab === "kaart" ? kaart : tab === "projecten" ? projects : tabel}</div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => set({ tab: v as Tab })}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="kaart">Kaart</TabsTrigger>
              <TabsTrigger value="tabel">Per gemeente</TabsTrigger>
              {horizon === "kt" && <TabsTrigger value="projecten">Per verrichting</TabsTrigger>}
            </TabsList>
            <div className="flex flex-wrap gap-2">
              <a href={getDataPath("/data/sociaal-wonen-alle-gegevens.xlsx")} download className={cn(buttonVariants({ variant: "outline", size: "sm" }), "no-underline")}>
                <Download className="mr-1.5 h-4 w-4" /> Download alle gegevens (xlsx)
              </a>
              <EmbedShare state={state} section={tab} />
            </div>
          </div>
          <div className="mt-3 space-y-3">{tab === "kaart" ? kaart : tab === "projecten" ? projects : tabel}</div>
        </Tabs>
      )}
    </div>
  )

  return (
    <div className="not-prose space-y-4 text-sm">
      {!embed && <PlanningContext />}
      <div className="space-y-3 rounded-lg border-2 border-primary/30 p-4">
        {showFilters && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm font-semibold">Planning</span>
            {planningFilter}
            <span className="text-xs text-muted-foreground">
              {m.horizons[horizon].omschrijving}
            </span>
          </div>
        )}
        {horizonBlock}
      </div>

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
