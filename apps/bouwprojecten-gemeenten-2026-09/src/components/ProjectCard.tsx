"use client"

import { Project } from "@embuild/shared/types/project-types"
import { Badge } from "@embuild/shared/components/ui/badge"
import { Button } from "@embuild/shared/components/ui/button"
import { MapPin, ChevronRight } from "lucide-react"
import { formatNumber } from "@embuild/shared/lib/number-formatters"

interface ProjectCardProps {
  project: Project
  onClick: () => void
  isExpanded?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  "00-algemene-financiering": "Algemene financiering",
  "01-algemeen-bestuur": "Algemeen bestuur",
  "02-mobiliteit": "Zich verplaatsen en mobiliteit",
  "03-natuur-milieu": "Natuur en milieubeheer",
  "04-veiligheidszorg": "Veiligheidszorg",
  "05-ondernemen-werken": "Ondernemen en werken",
  "06-wonen-ruimte": "Wonen en ruimtelijke ordening",
  "07-cultuur-vrije-tijd": "Cultuur en vrije tijd",
  "08-onderwijs": "Leren en onderwijs",
  "09-zorg-opvang": "Zorg en opvang",
  "overige": "Overige",
  // Legacy mappings (in case any old data exists)
  "wegenbouw": "wegenbouw",
  "riolering": "riolering",
  "scholenbouw": "scholenbouw",
  "sport": "sport",
  "cultuur": "cultuur",
  "gebouwen": "gebouwen",
  "verlichting": "verlichting",
  "groen": "groen",
  "ruimtelijke-ordening": "ruimtelijke ordening",
  "zorg": "zorg"
}

export function ProjectCard({ project, onClick, isExpanded = false }: ProjectCardProps) {
  // Find the peak year (year with highest amount)
  const peakYear = Object.entries(project.yearly_amounts)
    .reduce((max, [year, amount]) => {
      return amount > max.amount ? { year, amount } : max
    }, { year: "", amount: 0 })

  // Truncate long description
  const shortDescription = project.ac_long.length > 150
    ? project.ac_long.substring(0, 150) + "..."
    : project.ac_long

  return (
    <div
      className={`rounded-lg border transition-colors cursor-pointer group ${
        isExpanded
          ? "border-primary/40 bg-primary/5 shadow-sm"
          : "bg-card hover:bg-accent"
      }`}
      onClick={onClick}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold text-sm">{project.municipality}</span>
            </div>
            <h3 className={`font-semibold text-lg leading-tight transition-colors ${
              isExpanded ? "text-primary" : "group-hover:text-primary"
            }`}>
              {project.ac_short}
            </h3>
          </div>
          <ChevronRight
            className={`h-5 w-5 flex-shrink-0 transition-all ${
              isExpanded
                ? "text-primary rotate-90"
                : "text-muted-foreground group-hover:text-primary"
            }`}
          />
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-1 mb-3">
          {project.categories.map(cat => (
            <Badge key={cat} variant="secondary" className="text-xs">
              {CATEGORY_LABELS[cat] || cat}
            </Badge>
          ))}
        </div>

        {/* Amount */}
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              €{formatNumber(project.total_amount)}
            </span>
            {peakYear.year && (
              <span className="text-sm text-muted-foreground">
                ({peakYear.year})
              </span>
            )}
          </div>
          {project.amount_per_capita > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              €{formatNumber(project.amount_per_capita)} per inwoner
            </p>
          )}
        </div>

        {/* Description preview */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {shortDescription}
        </p>

        {/* Footer */}
        <div className="mt-3 pt-3 border-t">
          <Button
            variant={isExpanded ? "secondary" : "ghost"}
            size="sm"
            className={`w-full justify-between ${
              isExpanded ? "bg-primary/10 text-primary hover:bg-primary/15" : "group-hover:bg-primary/10"
            }`}
          >
            <span>{isExpanded ? "Details verbergen" : "Details bekijken"}</span>
            <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          </Button>
        </div>
      </div>
    </div>
  )
}
