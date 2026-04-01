"use client"

/**
 * Press References Component
 *
 * Displays press release citations in blog posts.
 * Loads data from analyses/<slug>/results/press_references.json (served from /analyses/<slug>/results/ in `public/`)
 */

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import {
  formatPressDate,
  truncateExcerpt,
  groupPressByYear,
} from "../../lib/press-utils"
import type { PressReferencesData } from "../../lib/press-utils"
import { getDataPath } from "../../lib/path-utils"
import { ExternalLink } from "lucide-react"

interface PressReferencesProps {
  slug: string
  title?: string
  showYear?: boolean
  maxExcerptLength?: number
  emptyMessage?: string
}

/**
 * Display press release references
 *
 * @param slug - Analysis slug to load data from
 * @param title - Section title (default: "Gerelateerde persberichten")
 * @param showYear - Group references by year (default: false)
 * @param maxExcerptLength - Maximum excerpt length (default: 200)
 * @param emptyMessage - Fallback text when no press references are available
 *
 * @example
 * <PressReferences slug="vergunningen-aanvragen" />
 *
 * @example
 * <PressReferences
 *   slug="vergunningen-aanvragen"
 *   title="Relevante persberichten"
 *   showYear={true}
 *   maxExcerptLength={150}
 * />
 */
export function PressReferences({
  slug,
  title = "Gerelateerde persberichten",
  showYear = false,
  maxExcerptLength = 200,
  emptyMessage = "Nog geen gerelateerde persberichten beschikbaar.",
}: PressReferencesProps) {
  // Load press references data via client-side fetch from `public/`
  const [data, setData] = useState<PressReferencesData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const url = getDataPath(`/press-references/${slug}.json`)

    fetch(url)
      .then((res) => {
        if (!res.ok) {
          if (res.status !== 404) {
            console.warn(`Error loading press references for slug "${slug}" at ${url}: ${res.status}`)
          }
          return null
        }
        return res.json()
      })
      .then((json) => {
        if (json) setData(json as PressReferencesData)
      })
      .catch((err) => {
        console.warn(`Error loading press references for slug "${slug}":`, err)
      })
      .finally(() => setLoaded(true))
  }, [slug])

  if (!loaded) {
    return null
  }

  if (!data || !data.references || data.references.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    )
  }

  // Render with year grouping
  if (showYear) {
    const groupedByYear = groupPressByYear(data.references)

    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {[...groupedByYear.entries()].map(([year, refs]) => (
            <div key={year}>
              <h3 className="text-lg font-semibold mb-3">{year}</h3>
              <ul className="space-y-3">
                {refs.map((ref) => (
                  <PressReferenceItem
                    key={ref.id}
                    reference={ref}
                    maxExcerptLength={maxExcerptLength}
                  />
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  // Render without year grouping (default)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {data.references.map((ref) => (
            <PressReferenceItem
              key={ref.id}
              reference={ref}
              maxExcerptLength={maxExcerptLength}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/**
 * Individual press reference item
 */
function PressReferenceItem({
  reference,
  maxExcerptLength,
}: {
  reference: PressReferencesData["references"][0]
  maxExcerptLength: number
}) {
  return (
    <li className="border-l-2 border-primary pl-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <a
          href={reference.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline inline-flex items-center gap-1"
        >
          {reference.title}
          <ExternalLink className="h-3 w-3 inline" />
        </a>
        <time className="text-sm text-muted-foreground whitespace-nowrap">
          {formatPressDate(reference.date)}
        </time>
      </div>
      {reference.excerpt && (
        <p className="text-sm text-muted-foreground mt-1">
          &quot;{truncateExcerpt(reference.excerpt, maxExcerptLength)}&quot;
        </p>
      )}
    </li>
  )
}
