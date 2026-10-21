"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { nl } from "date-fns/locale"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Badge } from "@embuild/shared/components/ui/badge"

export interface AnalysisVersion {
  slug: string
  label: string
  date: string
  summary: string
  url: string
  sourcePublicationDate?: string
}

export interface Analysis {
  slug: string
  title: string
  date: string
  summary: string
  tags: string[]
  sourcePublicationDate?: string
  url: string
  defaultVersion?: string
  comparison?: { label: string; url: string }
  versions?: AnalysisVersion[]
}

function formatDate(isoDate: string) {
  return format(parseISO(isoDate), "d MMMM yyyy", { locale: nl })
}

function Tags({ tags }: { tags: string[] | undefined }) {
  return (
    <>
      {tags?.map((tag) => (
        <Badge key={tag} variant="secondary">{tag}</Badge>
      ))}
    </>
  )
}

function SingleVersionCard({ analysis }: { analysis: Analysis }) {
  return (
    <Link href={analysis.url}>
      <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader>
          <CardTitle>{analysis.title}</CardTitle>
          <CardDescription>{formatDate(analysis.date)}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{analysis.summary}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Tags tags={analysis.tags} />
        </CardFooter>
      </Card>
    </Link>
  )
}

/**
 * Kaart met versiekiezer. De kaart zelf is klikbaar via een uitgerekte link op de titel, zodat de
 * versiekeuze niet in een anchor hoeft te staan.
 */
function VersionedCard({ analysis, versions }: { analysis: Analysis; versions: AnalysisVersion[] }) {
  const initial = versions.find((version) => version.slug === analysis.defaultVersion) ?? versions[0]
  const [selectedSlug, setSelectedSlug] = useState(initial.slug)
  const selectId = useId()
  const selected = versions.find((version) => version.slug === selectedSlug) ?? initial

  return (
    <Card className="relative h-full hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader>
        <CardTitle>
          <Link href={selected.url} className="after:absolute after:inset-0 after:content-['']">
            {analysis.title}
          </Link>
        </CardTitle>
        <CardDescription>{formatDate(selected.date)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{selected.summary}</p>
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <label htmlFor={selectId} className="w-full text-xs text-muted-foreground">Versie</label>
          <select
            id={selectId}
            value={selected.slug}
            onChange={(event) => setSelectedSlug(event.target.value)}
            className="max-w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {versions.map((version) => (
              <option key={version.slug} value={version.slug}>{version.label}</option>
            ))}
          </select>
          {analysis.comparison && (
            <Link
              href={analysis.comparison.url}
              className="ml-auto text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {analysis.comparison.label}
            </Link>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Tags tags={analysis.tags} />
      </CardFooter>
    </Card>
  )
}

export function AnalysisCard({ analysis }: { analysis: Analysis }) {
  const versions = analysis.versions ?? []
  if (versions.length > 1) {
    return <VersionedCard analysis={analysis} versions={versions} />
  }
  return <SingleVersionCard analysis={analysis} />
}
