"use client"

import { useState } from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { nl } from "date-fns/locale"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Badge } from "@embuild/shared/components/ui/badge"
import { cn } from "@embuild/shared/lib/utils"

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
 * versieknoppen (echte buttons) niet in een anchor hoeven te staan.
 */
function VersionedCard({ analysis, versions }: { analysis: Analysis; versions: AnalysisVersion[] }) {
  const initial = versions.find((version) => version.slug === analysis.defaultVersion) ?? versions[0]
  const [selectedSlug, setSelectedSlug] = useState(initial.slug)
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
        <div role="group" aria-label="Versie" className="relative z-10 flex flex-wrap items-center gap-2">
          <span className="w-full text-xs text-muted-foreground">Versie</span>
          {versions.map((version) => {
            const isSelected = version.slug === selected.slug
            return (
              <button
                key={version.slug}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedSlug(version.slug)}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {version.label}
              </button>
            )
          })}
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
