"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Badge } from "@embuild/shared/components/ui/badge"
import { ChevronDown, ChevronUp, FileText } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { ProjectDetailModal } from "./ProjectDetailModal"
import { fetchBouwprojectenJson } from "@embuild/shared/lib/bouwprojecten-data"
import type { Project, ProjectMetadata } from "@embuild/shared/types/project-types"

export function TopProjectsByCategory() {
  const [metadata, setMetadata] = useState<ProjectMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadMetadata = async () => {
      try {
        const data = await fetchBouwprojectenJson<ProjectMetadata>(
          "/data/projects_metadata.json"
        )

        if (!cancelled) {
          setMetadata(data)
        }
      } catch (loadError) {
        console.error("Error loading metadata:", loadError)
        if (!cancelled) {
          setError("Kon metadata niet laden")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadMetadata()

    return () => {
      cancelled = true
    }
  }, [])

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((previous) => {
      const next = new Set(previous)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    )
  }

  if (error || !metadata) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-red-800">Fout bij het laden: {error}</p>
      </div>
    )
  }

  const topProjectsLimit = metadata.category_top_projects_limit ?? 10
  const sortedCategories = Object.entries(metadata.categories)
    .filter(([, category]) => category.project_count > 0)
    .sort((a, b) => {
      if (a[0] === "overige") return 1
      if (b[0] === "overige") return -1
      return b[1].total_amount - a[1].total_amount
    })

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-xl font-semibold mb-2">Top projecten per categorie</h3>
        <p className="text-muted-foreground text-sm">
          Top {topProjectsLimit} grootste investeringsprojecten per sector, gebaseerd op totaalbedrag over de volledige planperiode 2026-2031.
        </p>
      </div>

      <div className="space-y-3">
        {sortedCategories.map(([categoryId, category]) => {
          const isExpanded = expandedCategories.has(categoryId)
          const hasProjects = category.largest_projects.length > 0

          return (
            <Card key={categoryId} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{category.label}</CardTitle>
                    <CardDescription className="mt-1">
                      {category.project_count.toLocaleString("nl-BE")} projecten ·
                      totaal €{(category.total_amount / 1_000_000).toFixed(1)}M ·
                      gemiddeld €{(category.total_amount / category.project_count / 1000).toFixed(0)}k
                    </CardDescription>
                  </div>
                  {hasProjects && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCategory(categoryId)}
                      className="shrink-0"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Verberg
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Toon top {Math.min(topProjectsLimit, category.largest_projects.length)}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>

              {isExpanded && hasProjects && (
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {category.largest_projects.map((project, index) => (
                      <div
                        key={`${project.nis_code}-${project.ac_code}`}
                        className="rounded-lg border bg-muted/50 p-4"
                      >
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="font-mono text-xs">
                                #{index + 1}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {project.municipality}
                              </span>
                            </div>
                            <h4 className="font-medium leading-tight">{project.ac_short}</h4>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedProject({
                                  municipality: project.municipality,
                                  nis_code: project.nis_code,
                                  bd_code: project.bd_code || "",
                                  bd_short: project.bd_short || "",
                                  bd_long: project.bd_long || "",
                                  ap_code: project.ap_code || "",
                                  ap_short: project.ap_short || "",
                                  ap_long: project.ap_long || "",
                                  ac_code: project.ac_code,
                                  ac_short: project.ac_short,
                                  ac_long:
                                    project.ac_long ||
                                    project.ap_long ||
                                    project.bd_long ||
                                    project.ap_short ||
                                    project.bd_short ||
                                    project.ac_short,
                                  total_amount: project.total_amount,
                                  amount_per_capita: project.amount_per_capita || 0,
                                  yearly_amounts: project.yearly_amounts as Project["yearly_amounts"],
                                  yearly_per_capita:
                                    (project.yearly_per_capita as Project["yearly_per_capita"]) || {
                                      "2026": 0,
                                      "2027": 0,
                                      "2028": 0,
                                      "2029": 0,
                                      "2030": 0,
                                      "2031": 0,
                                    },
                                  categories: [category.id],
                                })
                              }}
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              Details
                            </Button>
                            <div className="text-right">
                              <div className="text-lg font-bold">
                                €{(project.total_amount / 1_000_000).toFixed(2)}M
                              </div>
                              <div className="text-xs text-muted-foreground">
                                totaal 2026-2031
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t">
                          <div className="grid grid-cols-6 gap-2 text-xs">
                            {Object.entries(project.yearly_amounts)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([year, amount]) => (
                                <div key={year} className="text-center">
                                  <div className="text-muted-foreground font-medium mb-1">
                                    {year}
                                  </div>
                                  <div className="font-mono">
                                    {amount > 0 ? `€${(amount / 1000).toFixed(0)}k` : "—"}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          isOpen={!!selectedProject}
          onClose={() => setSelectedProject(null)}
          metadata={metadata}
        />
      )}
    </div>
  )
}
