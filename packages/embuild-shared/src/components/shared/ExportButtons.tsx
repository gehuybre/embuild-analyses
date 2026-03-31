"use client"

import { useState, useCallback } from "react"
import { Button } from "../ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover"
import { Download, Code, Check, Copy } from "lucide-react"
import { isEmbeddable, getEmbedConfig } from "../../lib/embed-config"
import { getBasePath } from "../../lib/path-utils"
import { useEmbedFilters } from "../../lib/stores/embed-filters-store"
import { useIsEmbedRoute } from "../../lib/use-is-embed-route"

type ExportData = {
  label: string
  value: number
  periodCells?: Array<string | number>
  [key: string]: string | number | Array<string | number> | null | undefined
}

interface ExportButtonsProps {
  /** Data to export as CSV */
  data: ExportData[]
  /** Title for the export (used in filename and embed) */
  title: string
  /** Analysis slug for embed URL */
  slug: string
  /** Unique section ID for embed URL */
  sectionId: string
  /** Current view type (chart, table, map) */
  viewType: "chart" | "table" | "map"
  /** Optional column headers for CSV */
  periodHeaders?: string[]
  /** Optional label for the value column */
  valueLabel?: string
  /** Optional data source description */
  dataSource?: string
  /** Optional data source URL */
  dataSourceUrl?: string
  /**
   * Optional overrides for embed URL parameters.
   * Values here override the current store state for this embed.
   */
  embedParams?: Record<string, string | number | null | undefined>
}

export function ExportButtons({
  data,
  title,
  slug,
  sectionId,
  viewType,
  periodHeaders = ["Jaar", "Kwartaal"],
  valueLabel = "Aantal",
  dataSource,
  dataSourceUrl,
  embedParams,
}: ExportButtonsProps) {
  const [copied, setCopied] = useState(false)
  const isEmbedRoute = useIsEmbedRoute()

  const downloadCSV = useCallback(() => {
    if (!data?.length) return

    // Build metadata header as comments
    const metadata: string[] = []
    metadata.push(`# ${title}`)
    metadata.push(`# Gedownload op: ${new Date().toLocaleDateString("nl-BE", { year: "numeric", month: "long", day: "numeric" })}`)

    if (dataSource) {
      metadata.push(`# Bron: ${dataSource}`)
    }
    if (dataSourceUrl) {
      metadata.push(`# Bron URL: ${dataSourceUrl}`)
    }

    // Add the analysis page URL
    const baseUrl = typeof window !== "undefined"
      ? window.location.origin + getBasePath()
      : ""
    metadata.push(`# Analyse: ${baseUrl}/analyses/${slug}/`)
    metadata.push(`#`)

    // Detect additional columns (beyond standard label, value, periodCells)
    const standardKeys = new Set(["label", "value", "periodCells"])
    const additionalColumns: string[] = []

    if (data.length > 0) {
      const firstRow = data[0]
      for (const key in firstRow) {
        if (!standardKeys.has(key) && typeof firstRow[key] === "number") {
          additionalColumns.push(key)
        }
      }
    }

    // Build CSV headers
    const headers = additionalColumns.length > 0
      ? [...periodHeaders, ...additionalColumns]
      : [...periodHeaders, valueLabel]

    // Build CSV rows
    const rows = data.map((row) => {
      const periodValues = row.periodCells ?? [row.label]

      if (additionalColumns.length > 0) {
        // Multi-column export: include all additional columns
        const columnValues = additionalColumns.map(col => row[col] ?? "")
        return [...periodValues, ...columnValues].join(",")
      } else {
        // Single value export: use the value field
        return [...periodValues, row.value].join(",")
      }
    })

    const csv = [...metadata, headers.join(","), ...rows].join("\n")

    // Create and trigger download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${slug}-${sectionId}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [data, title, slug, sectionId, periodHeaders, valueLabel, dataSource, dataSourceUrl])

  // Get current filter state from store for automatic embed URL generation
  const toQueryString = useEmbedFilters((state) => state.toQueryString)
  const storeCurrentView = useEmbedFilters((state) => state.currentView)
  const storeAnalysisSlug = useEmbedFilters((state) => state.analysisSlug)

  const getEmbedCode = useCallback((): string => {
    // Type guard: validate that this section is embeddable
    if (!isEmbeddable(slug, sectionId)) {
      // Return an HTML comment instead of throwing to avoid breaking the UI
      return `<!-- Embed not available for ${slug}/${sectionId} -->
<!-- To make this section embeddable, add it to EMBED_CONFIGS in src/lib/embed-config.ts -->`
    }

    // Get embed config to access height setting
    const config = getEmbedConfig(slug, sectionId)
    const height = config?.height ?? 500 // Default to 500px if not configured

    // Get the base URL for embed routes
    // Use environment variable (set at build time) instead of inferring from current URL
    // This ensures embeds always work correctly on both localhost and production hosts
    const embedBasePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const baseUrl = typeof window !== "undefined"
      ? window.location.origin + embedBasePath
      : ""

    // URL-encode slug and sectionId for security
    const encodedSlug = encodeURIComponent(slug)
    const encodedSectionId = encodeURIComponent(sectionId)

    // Only use store params when the store context matches this analysis slug.
    // Otherwise we risk leaking default/stale params from another analysis.
    const canUseStoreState = storeAnalysisSlug === slug
    const params = new URLSearchParams(canUseStoreState ? toQueryString() : "")

    // Ensure embed URL always carries the current view (chart/table/map)
    // Use store's currentView instead of prop to ensure it reflects what the user actually selected
    const viewKey = `${slug}.view`
    const effectiveView = canUseStoreState ? (storeCurrentView || viewType) : viewType
    params.set(viewKey, effectiveView)
    params.delete("view")

    if (embedParams) {
      Object.entries(embedParams).forEach(([key, value]) => {
        // Prefix with slug to avoid collisions when multiple analyses share the URL.
        const prefixedKey = key.startsWith(`${slug}.`) ? key : `${slug}.${key}`

        if (value === null || value === undefined) {
          params.delete(prefixedKey)
          if (prefixedKey !== key) {
            params.delete(key)
          }
          return
        }

        params.set(prefixedKey, String(value))
        if (prefixedKey !== key) {
          params.delete(key)
        }
      })
    }

    const filterParams = params.toString()

    // Build embed URL with ALL current filters from store
    const embedUrl = filterParams
      ? `${baseUrl}/embed/${encodedSlug}/${encodedSectionId}/?${filterParams}`
      : `${baseUrl}/embed/${encodedSlug}/${encodedSectionId}/`

    return `<iframe
  src="${embedUrl}"
  data-data-blog-embed="true"
  width="100%"
  height="${height}"
  style="border: 0;"
  title="${title}"
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
  }, [slug, sectionId, title, toQueryString, storeCurrentView, storeAnalysisSlug, embedParams, viewType])

  const copyEmbedCode = useCallback(async () => {
    const code = getEmbedCode()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = code
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [getEmbedCode])

  if (isEmbedRoute) {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={downloadCSV}
        disabled={!data?.length}
        title="Download CSV"
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
            <div className="font-medium text-sm">Embed deze visualisatie</div>
            <p className="text-xs text-muted-foreground">
              Kopieer de onderstaande code om deze {viewType === "chart" ? "grafiek" : viewType === "table" ? "tabel" : "kaart"} in je website te integreren.
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
  )
}
