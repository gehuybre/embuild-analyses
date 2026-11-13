"use client"

import { useEffect, useMemo, useState } from "react"
import { FullscreenEmbedButton } from "@embuild/shared/components/shared/FullscreenEmbedButton"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { buildComparison } from "./gip/compare"
import { CompareView } from "./gip/CompareView"
import { GipEmbedButton, gipEmbedUrl } from "./gip/EmbedControls"
import { FilterBar } from "./gip/FilterBar"
import { Header } from "./gip/Header"
import { LargeView } from "./gip/LargeView"
import { ProjectsView, type ProjectsLayout } from "./gip/ProjectsView"
import {
  ALL_PROGRAMS,
  DATA_PATHS,
  VIEW_LABELS,
  budgetKeyForYear,
  isBudgetKey,
  periodLabel,
  tabForView,
  viewForTab,
  yearsForMetadata,
  type BudgetKey,
  type GipBundle,
  type GipTab,
  type GipVersion,
  type ViewId,
} from "./gip/model"
import { Segmented } from "./gip/ui"

const FADE_CSS = `
@keyframes gip-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.gip-fade { animation: gip-fade-in 180ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .gip-fade { animation: none; } }
`

export function GIPDashboard({
  embeddedSection,
  initialProgram = ALL_PROGRAMS,
  initialBudgetKey = "budget_total",
  initialVersion = "2026",
}: {
  embeddedSection?: GipTab
  initialProgram?: string
  initialBudgetKey?: BudgetKey
  initialVersion?: GipVersion
} = {}) {
  const embedded = Boolean(embeddedSection)
  const [view, setView] = useState<ViewId>(embeddedSection ? viewForTab(embeddedSection) : "compare")
  const [layout, setLayout] = useState<ProjectsLayout>(embeddedSection === "map" ? "map" : "list")
  const [version, setVersion] = useState<GipVersion>(initialVersion)
  const [program, setProgram] = useState(initialProgram)
  const [budgetKey, setBudgetKey] = useState<BudgetKey>(initialBudgetKey)
  const { data: bundle, loading, error } = useJsonBundle<{ gip2025: GipBundle; gip2026: GipBundle }>(DATA_PATHS)

  // Een embed kan versie, programma en budgetjaar via de url meekrijgen
  useEffect(() => {
    if (!embeddedSection || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const v = params.get("version")
    const p = params.get("program")
    const b = params.get("budget")
    if (v === "2025" || v === "2026") setVersion(v)
    if (p?.trim()) setProgram(p)
    if (b && isBudgetKey(b)) setBudgetKey(b)
  }, [embeddedSection])

  const comparison = useMemo(
    () => (bundle ? buildComparison(bundle.gip2025, bundle.gip2026) : null),
    [bundle]
  )
  const projectsGip = version === "2025" ? bundle?.gip2025 : bundle?.gip2026
  const years = yearsForMetadata(projectsGip?.metadata)
  const activePeriod = periodLabel(years, projectsGip?.metadata)

  const programs = useMemo(() => {
    if (view === "compare") return comparison?.diffs.map((row) => row.name) ?? []
    return projectsGip?.programSummary.map((row) => row.name) ?? []
  }, [view, comparison, projectsGip])

  // Een programma dat niet bestaat in de gekozen weergave of versie valt terug op "alle"
  useEffect(() => {
    if (program !== ALL_PROGRAMS && programs.length && !programs.includes(program)) setProgram(ALL_PROGRAMS)
  }, [program, programs])

  useEffect(() => {
    if (budgetKey === "budget_total") return
    if (!years.map(budgetKeyForYear).includes(budgetKey)) setBudgetKey("budget_total")
  }, [budgetKey, years])

  if (loading) {
    return <div className="not-prose rounded-lg border p-6 text-sm text-muted-foreground">Data laden...</div>
  }
  if (error || !bundle || !comparison || !projectsGip) {
    return (
      <div className="not-prose rounded-lg border border-destructive/30 p-6 text-sm text-destructive">
        Fout bij het laden van de GIP-data: {error ?? "onbekende fout"}
      </div>
    )
  }

  const section = tabForView(view, layout)
  const showHeader = !embedded || view === "compare"

  return (
    <div className={`not-prose ${embedded ? "space-y-6 p-4" : "space-y-8"}`}>
      <style>{FADE_CSS}</style>
      {showHeader && <Header comparison={comparison} />}

      {!embedded && (
        <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Segmented<ViewId>
            tone="primary"
            label="Weergave"
            value={view}
            onChange={setView}
            options={(Object.keys(VIEW_LABELS) as ViewId[]).map((id) => ({ value: id, label: VIEW_LABELS[id] }))}
          />
          <div className="flex items-center gap-2">
            <GipEmbedButton section={section} selectedVersion={version} selectedProgram={program} selectedBudgetKey={budgetKey} />
            <FullscreenEmbedButton
              className="shrink-0 gap-2"
              getUrl={() => gipEmbedUrl(section, version, program, budgetKey)}
            />
          </div>
        </div>
      )}

      {!embedded && (
        <FilterBar
          view={view}
          programs={programs}
          program={program}
          onProgramChange={setProgram}
          version={version}
          onVersionChange={setVersion}
          years={years}
          periodLabel={activePeriod}
          budgetKey={budgetKey}
          onBudgetKeyChange={setBudgetKey}
        />
      )}

      <div key={`${view}-${layout}`} className="gip-fade space-y-8">
        {view === "compare" && (
          <CompareView
            gip2025={bundle.gip2025}
            gip2026={bundle.gip2026}
            comparison={comparison}
            selectedProgram={program}
            onProgramChange={setProgram}
          />
        )}
        {view === "projects" && (
          <ProjectsView
            gip={projectsGip}
            version={version}
            program={program}
            budgetKey={budgetKey}
            years={years}
            layout={layout}
            onLayoutChange={setLayout}
            embedded={embedded}
          />
        )}
        {view === "large" && <LargeView gip2025={bundle.gip2025} gip2026={bundle.gip2026} />}
      </div>
    </div>
  )
}
