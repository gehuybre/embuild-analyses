"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  CategoryProjectPreview,
  MunicipalityIndexEntry,
  Project,
  ProjectFilters,
  ProjectMetadata,
  SortOption,
} from "@embuild/shared/types/project-types"
import { ProjectFiltersComponent } from "./ProjectFilters"
import { ProjectList } from "./ProjectList"
import { ProjectDetailModal } from "./ProjectDetailModal"
import { Button } from "@embuild/shared/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@embuild/shared/components/ui/popover"
import { Download, Code, Check, Copy } from "lucide-react"
import { getBasePath } from "@embuild/shared/lib/path-utils"
import { fetchBouwprojectenJson } from "@embuild/shared/lib/bouwprojecten-data"
import { useIsEmbedRoute } from "@embuild/shared/lib/use-is-embed-route"

interface ProjectScopeState {
  type: "none" | "municipality" | "category-top" | "category-full"
  label?: string
  totalAvailable: number
  totalScopeAmount: number
  isPartial: boolean
}

const EMPTY_SCOPE: ProjectScopeState = {
  type: "none",
  totalAvailable: 0,
  totalScopeAmount: 0,
  isPartial: false,
}

function getProjectKey(project: Pick<Project, "nis_code" | "ac_code" | "ac_short">) {
  return `${project.nis_code}||${project.ac_code}||${project.ac_short}`
}

function normalizeYearlyAmounts(values?: Record<string, number>): Project["yearly_amounts"] {
  return {
    "2026": values?.["2026"] || 0,
    "2027": values?.["2027"] || 0,
    "2028": values?.["2028"] || 0,
    "2029": values?.["2029"] || 0,
    "2030": values?.["2030"] || 0,
    "2031": values?.["2031"] || 0,
  }
}

function normalizeProject(
  project: Partial<Project> | CategoryProjectPreview,
  categoryId?: string
): Project {
  return {
    municipality: project.municipality || "",
    nis_code: project.nis_code || "",
    bd_code: project.bd_code || "",
    bd_short: project.bd_short || "",
    bd_long: project.bd_long || "",
    ap_code: project.ap_code || "",
    ap_short: project.ap_short || "",
    ap_long: project.ap_long || "",
    ac_code: project.ac_code || "",
    ac_short: project.ac_short || "",
    ac_long:
      project.ac_long ||
      project.ap_long ||
      project.bd_long ||
      project.ap_short ||
      project.bd_short ||
      project.ac_short ||
      "",
    total_amount: project.total_amount || 0,
    amount_per_capita: project.amount_per_capita || 0,
    yearly_amounts: normalizeYearlyAmounts(project.yearly_amounts),
    yearly_per_capita: normalizeYearlyAmounts(project.yearly_per_capita),
    categories: project.categories && project.categories.length > 0
      ? project.categories
      : categoryId
        ? [categoryId]
        : [],
  }
}

function dedupeProjects(projects: Project[]) {
  const seen = new Set<string>()

  return projects.filter((project) => {
    const key = getProjectKey(project)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function ProjectBrowser() {
  const isEmbedRoute = useIsEmbedRoute()
  const [projects, setProjects] = useState<Project[]>([])
  const [metadata, setMetadata] = useState<ProjectMetadata | null>(null)
  const [municipalities, setMunicipalities] = useState<MunicipalityIndexEntry[]>([])
  const [scopeState, setScopeState] = useState<ProjectScopeState>(EMPTY_SCOPE)
  const [fullCategorySelectionKey, setFullCategorySelectionKey] = useState<string | null>(null)
  const municipalityCacheRef = useRef<Map<string, Project[]>>(new Map())
  const categoryCacheRef = useRef<Map<string, Project[]>>(new Map())
  const requestIdRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEmbeddedInIframe, setIsEmbeddedInIframe] = useState(false)

  const [filters, setFilters] = useState<ProjectFilters>({})
  const [sortOption, setSortOption] = useState<SortOption>("amount-desc")
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [copied, setCopied] = useState(false)

  const selectedCategoryIds = useMemo(
    () => [...(filters.categories || [])].sort(),
    [filters.categories]
  )
  const categorySelectionKey = selectedCategoryIds.join("|")
  const hasBrowseScope = Boolean(filters.nis_code || selectedCategoryIds.length > 0)
  const searchEnabled = hasBrowseScope
  const categorySelectionIsFull =
    selectedCategoryIds.length > 0 && fullCategorySelectionKey === categorySelectionKey

  const dataSourceKey = useMemo(() => {
    if (filters.nis_code) {
      return `municipality:${filters.nis_code}`
    }
    if (selectedCategoryIds.length > 0) {
      return `${categorySelectionIsFull ? "category-full" : "category-top"}:${categorySelectionKey}`
    }
    return "none"
  }, [filters.nis_code, selectedCategoryIds.length, categorySelectionIsFull, categorySelectionKey])

  useEffect(() => {
    let cancelled = false

    const initializeData = async () => {
      setLoading(true)
      setError(null)

      try {
        const [metadataResponse, municipalityIndexResponse] = await Promise.all([
          fetchBouwprojectenJson<ProjectMetadata>("/data/projects_metadata.json"),
          fetchBouwprojectenJson<MunicipalityIndexEntry[]>("/data/municipality_index.json"),
        ])

        if (cancelled) {
          return
        }

        setMetadata(metadataResponse)
        setMunicipalities(municipalityIndexResponse)
      } catch (loadError) {
        console.error("Error loading project browser metadata:", loadError)
        if (!cancelled) {
          setError("Kon projectdata niet initialiseren.")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    initializeData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    setIsEmbeddedInIframe(window.parent !== window)
  }, [])

  useEffect(() => {
    setSelectedProject(null)
  }, [dataSourceKey, filters.searchQuery])

  useEffect(() => {
    if (!metadata || municipalities.length === 0) {
      return
    }

    const requestId = ++requestIdRef.current

    const loadScopedProjects = async () => {
      if (!hasBrowseScope) {
        setProjects([])
        setScopeState(EMPTY_SCOPE)
        setLoading(false)
        setError(null)
        return
      }

      setError(null)

      if (filters.nis_code) {
        const municipalityEntry = municipalities.find(
          (municipality) => municipality.nis_code === filters.nis_code
        )

        if (!municipalityEntry) {
          setProjects([])
          setScopeState(EMPTY_SCOPE)
          setError("Kon de geselecteerde gemeente niet vinden.")
          return
        }

        const cachedProjects = municipalityCacheRef.current.get(filters.nis_code)
        if (cachedProjects) {
          if (requestId === requestIdRef.current) {
            setProjects(cachedProjects)
            setScopeState({
              type: "municipality",
              label: municipalityEntry.municipality,
              totalAvailable: municipalityEntry.project_count,
              totalScopeAmount: municipalityEntry.total_amount,
              isPartial: false,
            })
            setLoading(false)
          }
          return
        }

        setLoading(true)
        setProjects([])

        try {
          const municipalityProjects = await fetchBouwprojectenJson<Project[]>(
            `/data/${municipalityEntry.file}`
          )

          if (requestId !== requestIdRef.current) {
            return
          }

          municipalityCacheRef.current.set(
            filters.nis_code,
            municipalityProjects.map((project) => normalizeProject(project))
          )

          setProjects(municipalityProjects.map((project) => normalizeProject(project)))
          setScopeState({
            type: "municipality",
            label: municipalityEntry.municipality,
            totalAvailable: municipalityEntry.project_count,
            totalScopeAmount: municipalityEntry.total_amount,
            isPartial: false,
          })
        } catch (loadError) {
          console.error("Error loading municipality projects:", loadError)
          if (requestId === requestIdRef.current) {
            setProjects([])
            setScopeState(EMPTY_SCOPE)
            setError("Kon de projecten voor deze gemeente niet laden.")
          }
        } finally {
          if (requestId === requestIdRef.current) {
            setLoading(false)
          }
        }

        return
      }

      if (selectedCategoryIds.length === 0) {
        setProjects([])
        setScopeState(EMPTY_SCOPE)
        setLoading(false)
        return
      }

      const totalAvailable = selectedCategoryIds.reduce(
        (sum, categoryId) => sum + (metadata.categories[categoryId]?.project_count || 0),
        0
      )
      const totalScopeAmount = selectedCategoryIds.reduce(
        (sum, categoryId) => sum + (metadata.categories[categoryId]?.total_amount || 0),
        0
      )
      const selectionLabel =
        selectedCategoryIds.length === 1
          ? metadata.categories[selectedCategoryIds[0]]?.label
          : `${selectedCategoryIds.length} categorieën`

      if (!categorySelectionIsFull) {
        const topProjects = dedupeProjects(
          selectedCategoryIds.flatMap((categoryId) =>
            (metadata.categories[categoryId]?.largest_projects || []).map((project) =>
              normalizeProject(project, categoryId)
            )
          )
        ).sort((a, b) => b.total_amount - a.total_amount)

        setProjects(topProjects)
        setScopeState({
          type: "category-top",
          label: selectionLabel,
          totalAvailable,
          totalScopeAmount,
          isPartial: true,
        })
        setLoading(false)
        return
      }

      setLoading(true)
      setProjects([])

      try {
        const categoryResults = await Promise.all(
          selectedCategoryIds.map(async (categoryId) => {
            const cachedProjects = categoryCacheRef.current.get(categoryId)
            if (cachedProjects) {
              return cachedProjects
            }

            const categoryFile = metadata.categories[categoryId]?.data_file
            if (!categoryFile) {
              return []
            }

            const categoryProjects = await fetchBouwprojectenJson<Project[]>(
              `/data/${categoryFile}`
            )
            const normalizedProjects = categoryProjects.map((project) => normalizeProject(project))
            categoryCacheRef.current.set(categoryId, normalizedProjects)
            return normalizedProjects
          })
        )

        if (requestId !== requestIdRef.current) {
          return
        }

        setProjects(
          dedupeProjects(categoryResults.flat()).sort((a, b) => b.total_amount - a.total_amount)
        )
        setScopeState({
          type: "category-full",
          label: selectionLabel,
          totalAvailable,
          totalScopeAmount,
          isPartial: false,
        })
      } catch (loadError) {
        console.error("Error loading category projects:", loadError)
        if (requestId === requestIdRef.current) {
          setProjects([])
          setScopeState(EMPTY_SCOPE)
          setError("Kon de volledige categorie-selectie niet laden.")
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
        }
      }
    }

    loadScopedProjects()
  }, [
    metadata,
    municipalities,
    hasBrowseScope,
    filters.nis_code,
    selectedCategoryIds,
    categorySelectionIsFull,
    dataSourceKey,
  ])

  const filteredAndSortedProjects = useMemo(() => {
    let filtered = projects

    if (filters.nis_code) {
      filtered = filtered.filter((project) => project.nis_code === filters.nis_code)
    }

    if (filters.categories && filters.categories.length > 0) {
      filtered = filtered.filter((project) =>
        project.categories.some((category) => filters.categories!.includes(category))
      )
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      filtered = filtered.filter((project) =>
        project.ac_short.toLowerCase().includes(query) ||
        project.ac_long.toLowerCase().includes(query) ||
        project.municipality.toLowerCase().includes(query)
      )
    }

    return [...filtered].sort((a, b) => {
      switch (sortOption) {
        case "amount-desc":
          return b.total_amount - a.total_amount
        case "amount-asc":
          return a.total_amount - b.total_amount
        case "municipality":
          return a.municipality.localeCompare(b.municipality)
        case "category":
          return (a.categories[0] || "").localeCompare(b.categories[0] || "")
        default:
          return 0
      }
    })
  }, [projects, filters, sortOption])

  const categoryCounts = useMemo(() => {
    if (!metadata) {
      return {}
    }

    if (!filters.nis_code) {
      return Object.fromEntries(
        Object.entries(metadata.categories).map(([categoryId, category]) => [
          categoryId,
          category.project_count,
        ])
      )
    }

    const counts = Object.fromEntries(
      Object.keys(metadata.categories).map((categoryId) => [categoryId, 0])
    )

    projects.forEach((project) => {
      project.categories.forEach((categoryId) => {
        if (counts[categoryId] !== undefined) {
          counts[categoryId] += 1
        }
      })
    })

    return counts
  }, [metadata, filters.nis_code, projects])

  const totalFilteredAmount = useMemo(
    () => filteredAndSortedProjects.reduce((sum, project) => sum + project.total_amount, 0),
    [filteredAndSortedProjects]
  )

  const getEmbedCode = (): string => {
    const baseUrl = typeof window !== "undefined"
      ? window.location.origin + getBasePath()
      : ""

    const embedUrl = `${baseUrl}/embed/bouwprojecten-gemeenten/projectbrowser/`

    return `<iframe
  src="${embedUrl}"
  data-data-blog-embed="true"
  width="100%"
  height="800"
  style="border: 0;"
  title="Projectbrowser - Gemeentelijke bouwprojecten"
  loading="lazy"
></iframe>
<script>
(function () {
  if (window.__DATA_BLOG_EMBED_RESIZER__) return;
  window.__DATA_BLOG_EMBED_RESIZER__ = true;

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "data-blog-embed:resize") return;
    var height = Number(data.height);
    if (!isFinite(height) || height <= 0) return;

    var iframes = document.querySelectorAll('iframe[data-data-blog-embed="true"]');
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      if (iframe.contentWindow === event.source) {
        iframe.style.height = Math.ceil(height) + "px";
        return;
      }
    }
  });
})();
</script>`
  }

  const copyEmbedCode = async () => {
    const code = getEmbedCode()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textArea = document.createElement("textarea")
      textArea.value = code
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleExportCSV = () => {
    const headers = [
      "Gemeente",
      "NIS Code",
      "Project Code",
      "Project Naam",
      "Categorieën",
      "Totaal Bedrag",
      "2026",
      "2027",
      "2028",
      "2029",
      "2030",
      "2031",
      "Beschrijving",
    ]

    const rows = filteredAndSortedProjects.map((project) => [
      project.municipality,
      project.nis_code,
      project.ac_code,
      project.ac_short,
      project.categories.join("; "),
      project.total_amount.toFixed(2),
      project.yearly_amounts["2026"].toFixed(2),
      project.yearly_amounts["2027"].toFixed(2),
      project.yearly_amounts["2028"].toFixed(2),
      project.yearly_amounts["2029"].toFixed(2),
      project.yearly_amounts["2030"].toFixed(2),
      project.yearly_amounts["2031"].toFixed(2),
      `"${project.ac_long.replace(/"/g, '""')}"`,
    ])

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n")

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute(
      "download",
      `bouwprojecten-gemeenten-${new Date().toISOString().split("T")[0]}.csv`
    )
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const showCriticalError = error && !metadata

  if (showCriticalError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-red-800">Fout bij het laden van projecten: {error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Opnieuw proberen
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-2xl font-bold mb-2">Projectbrowser - 2026-2031</h2>
        <p className="text-muted-foreground">
          Kies een gemeente of categorie. De browser laadt daarna enkel de relevante projectdata.
        </p>
      </div>

      {error && metadata && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-yellow-800 text-sm">{error}</p>
        </div>
      )}

      <ProjectFiltersComponent
        filters={filters}
        setFilters={setFilters}
        metadata={metadata}
        municipalities={municipalities}
        categoryCounts={categoryCounts}
        searchEnabled={searchEnabled}
        sortOption={sortOption}
        setSortOption={setSortOption}
      />

      {!hasBrowseScope && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-8 text-center">
          <p className="text-blue-900 font-medium mb-2">Kies eerst een gemeente of categorie</p>
          <p className="text-blue-800 text-sm">
            Een gemeente laadt alle lokale projecten. Een categorie toont standaard alleen de top
            projecten; de volledige categorie laad je pas op aanvraag.
          </p>
        </div>
      )}

      {hasBrowseScope && (
        <>
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gevonden projecten</p>
                <p className="text-2xl font-bold">
                  {filteredAndSortedProjects.length.toLocaleString("nl-BE")}
                </p>
                {scopeState.totalAvailable > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {scopeState.isPartial
                      ? `Topweergave van ${scopeState.totalAvailable.toLocaleString("nl-BE")} projecten in ${scopeState.label}`
                      : `${scopeState.totalAvailable.toLocaleString("nl-BE")} projecten geladen in ${scopeState.label}`}
                  </p>
                )}
              </div>

              <div className="text-left lg:text-right">
                <p className="text-sm text-muted-foreground">
                  {scopeState.isPartial ? "Getoond bedrag" : "Totaal bedrag"}
                </p>
                <p className="text-2xl font-bold">
                  €{(totalFilteredAmount / 1_000_000).toFixed(1)}M
                </p>
                {scopeState.isPartial && scopeState.totalScopeAmount > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Volledige selectie: €{(scopeState.totalScopeAmount / 1_000_000).toFixed(1)}M
                  </p>
                )}
              </div>

              {!isEmbedRoute && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleExportCSV}
                    disabled={filteredAndSortedProjects.length === 0}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">CSV</span>
                  </Button>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" title="Embed code">
                        <Code className="h-4 w-4" />
                        <span className="hidden sm:inline">Embed</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96" align="end">
                      <div className="space-y-3">
                        <div className="font-medium text-sm">Embed deze projectbrowser</div>
                        <p className="text-xs text-muted-foreground">
                          Kopieer de onderstaande code om deze projectbrowser in je website te integreren.
                        </p>
                        <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-all">
                          {getEmbedCode()}
                        </pre>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          onClick={copyEmbedCode}
                        >
                          {copied ? (
                            <>
                              <Check className="h-4 w-4" />
                              Gekopieerd!
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              Kopieer code
                            </>
                          )}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            {scopeState.type === "category-top" && metadata && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-amber-900">
                    We tonen hier standaard alleen de top{" "}
                    {metadata.category_top_projects_limit ?? 20} projecten.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFullCategorySelectionKey(categorySelectionKey)}
                    disabled={loading}
                  >
                    {loading
                      ? "Laden..."
                      : `Laad alle ${scopeState.totalAvailable.toLocaleString("nl-BE")} projecten`}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <ProjectList
            projects={filteredAndSortedProjects}
            onProjectClick={setSelectedProject}
            loading={loading}
            selectedProject={isEmbeddedInIframe ? selectedProject : null}
            expandedContent={
              isEmbeddedInIframe && selectedProject
                ? (
                  <ProjectDetailModal
                    project={selectedProject}
                    isOpen={true}
                    onClose={() => setSelectedProject(null)}
                    metadata={metadata}
                    embedded={true}
                  />
                )
                : undefined
            }
          />
        </>
      )}

      {selectedProject && !isEmbeddedInIframe && (
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
