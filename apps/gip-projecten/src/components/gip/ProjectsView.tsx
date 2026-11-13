"use client"

import { useMemo, useState } from "react"
import { Download, Maximize2, Search } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Input } from "@embuild/shared/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@embuild/shared/components/ui/table"
import { getDataPath } from "@embuild/shared/lib/path-utils"
import { InfrastructureProjectMap } from "../InfrastructureProjectMap"
import {
  ALL_PROGRAMS,
  MAP_PAGE_PATH,
  formatEuroCompact,
  type BudgetKey,
  type GipBundle,
  type GipVersion,
  type Year,
} from "./model"
import { Panel, Segmented, SectionHeading } from "./ui"

export type ProjectsLayout = "list" | "map"
const PAGE_SIZE = 30

export function ProjectsView({
  gip,
  version,
  program,
  budgetKey,
  years,
  layout,
  onLayoutChange,
  embedded,
}: {
  gip: GipBundle
  version: GipVersion
  program: string
  budgetKey: BudgetKey
  years: Year[]
  layout: ProjectsLayout
  onLayoutChange: (layout: ProjectsLayout) => void
  embedded: boolean
}) {
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return gip.projects
      .filter((project) => program === ALL_PROGRAMS || project.programma === program)
      .filter((project) => {
        if (!q) return true
        return [project.project, project.deelproject, project.locatie, project.programma, project.subprogramma, project.entiteit]
          .join(" ")
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => b[budgetKey] - a[budgetKey])
  }, [gip.projects, program, query, budgetKey])

  const visible = filtered.slice(0, limit)

  return (
    <div className="space-y-4">
      <SectionHeading
        title={layout === "map" ? "Projectkaart" : "Projectlijst"}
        description={
          layout === "map"
            ? "De kaart is opgemaakt op basis van de GIP-tabel. Niet elk project bevat genoeg geografische informatie, dus projecten kunnen ontbreken of onnauwkeurig staan."
            : `${filtered.length.toLocaleString("nl-BE")} (deel)projecten in deze selectie, gesorteerd op budget.`
        }
        actions={
          <>
            <Segmented
              label="Weergave"
              value={layout}
              onChange={onLayoutChange}
              options={[
                { value: "list", label: "Lijst" },
                { value: "map", label: "Kaart" },
              ]}
            />
            {layout === "map" && !embedded && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={MAP_PAGE_PATH} target="_blank" rel="noreferrer">
                  <Maximize2 className="h-4 w-4" />
                  Groot formaat
                </a>
              </Button>
            )}
          </>
        }
      />

      {layout === "map" ? (
        <Panel>
          <InfrastructureProjectMap
            features={gip.infrastructureFeatures}
            selectedProgram={program}
            selectedBudgetKey={budgetKey}
            formatBudget={formatEuroCompact}
            years={years}
          />
        </Panel>
      ) : (
        <Panel>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setLimit(PAGE_SIZE)
                  }}
                  placeholder="Zoek project, locatie of entiteit"
                  className="pl-9"
                />
              </div>
              {!embedded && (
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <a href={getDataPath(`/data/projects_${version}.csv`)}>
                    <Download className="h-4 w-4" />
                    CSV
                  </a>
                </Button>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[42%]">Project</TableHead>
                  <TableHead>Programma</TableHead>
                  <TableHead>Locatie</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium leading-snug">{project.project}</div>
                      {project.deelproject && (
                        <div className="mt-1 text-xs leading-snug text-muted-foreground">{project.deelproject}</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="leading-snug">{project.programma}</div>
                      <div className="mt-1 text-xs leading-snug text-muted-foreground">{project.entiteit}</div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="leading-snug">{project.locatie}</div>
                      {project.municipality_names.length > 0 && (
                        <div className="mt-1 text-xs leading-snug text-muted-foreground">
                          {project.municipality_names.slice(0, 3).join(", ")}
                          {project.municipality_names.length > 3 ? " ..." : ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatEuroCompact(project[budgetKey])}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > limit && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
                  Toon meer ({filtered.length - limit} resterend)
                </Button>
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}
