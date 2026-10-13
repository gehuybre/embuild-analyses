"use client"

import { Project, ProjectMetadata } from "@embuild/shared/types/project-types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@embuild/shared/components/ui/dialog"
import { Button } from "@embuild/shared/components/ui/button"
import { Badge } from "@embuild/shared/components/ui/badge"
import { Separator } from "@embuild/shared/components/ui/separator"
import { MapPin, Calendar, TrendingUp, X } from "lucide-react"
import { formatNumber } from "@embuild/shared/lib/number-formatters"

interface ProjectDetailModalProps {
  project: Project
  isOpen: boolean
  onClose: () => void
  metadata: ProjectMetadata | null
  embedded?: boolean
}

interface ProjectDetailSectionsProps {
  project: Project
  metadata: ProjectMetadata | null
}

function ProjectDetailSections({ project, metadata }: ProjectDetailSectionsProps) {
  // Find peak year
  const yearlyEntries = Object.entries(project.yearly_amounts)
  const peakYear = yearlyEntries.reduce((max, [year, amount]) => {
    return amount > max.amount ? { year, amount } : max
  }, { year: "", amount: 0 })

  return (
    <>
      {/* Municipality and Code */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <MapPin className="h-4 w-4" />
          <span>{project.municipality}</span>
        </div>
        <span>•</span>
        <span>NIS: {project.nis_code}</span>
        <span>•</span>
        <span>Code: {project.ac_code}</span>
      </div>

      <Separator />

      {/* Categories */}
      <div>
        <h3 className="font-semibold mb-2">categorieën</h3>
        <div className="flex flex-wrap gap-2">
          {project.categories.map(catId => {
            const cat = metadata?.categories[catId]
            return (
              <Badge key={catId} variant="secondary">
                {cat?.label || catId}
              </Badge>
            )
          })}
        </div>
      </div>

      <Separator />

      {/* Total Amount */}
      <div>
        <h3 className="font-semibold mb-2">totaal bedrag</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">
            €{formatNumber(project.total_amount)}
          </span>
          {project.amount_per_capita > 0 && (
            <span className="text-muted-foreground">
              (€{formatNumber(project.amount_per_capita)} per inwoner)
            </span>
          )}
        </div>
      </div>

      <Separator />

      {/* Description */}
      <div>
        <h3 className="font-semibold mb-2">beschrijving</h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {project.ac_long}
        </p>
      </div>

      <Separator />

      {/* Yearly Planning */}
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          planning per jaar
        </h3>
        <div className="space-y-2">
          {yearlyEntries.map(([year, amount]) => {
            const isPeak = year === peakYear.year && amount > 0
            const percentage = project.total_amount > 0
              ? (amount / project.total_amount) * 100
              : 0

            return (
              <div key={year} className="flex items-center gap-3">
                <div className="w-16 font-mono text-sm">{year}</div>
                <div className="flex-1">
                  <div className="h-8 bg-muted rounded-md overflow-hidden relative">
                    {amount > 0 && (
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    )}
                    <div className="absolute inset-0 flex items-center px-3">
                      <span className="text-sm font-medium">
                        €{formatNumber(amount)}
                      </span>
                      {isPeak && (
                        <TrendingUp className="ml-2 h-4 w-4 text-primary" />
                      )}
                    </div>
                  </div>
                </div>
                <div className="w-16 text-right text-sm text-muted-foreground">
                  {percentage > 0 ? `${percentage.toFixed(0)}%` : ""}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Context sections */}
      {(project.ap_short || project.bd_short) && (
        <>
          <Separator />
          <div className="space-y-4">
            {/* Actieplan */}
            {project.ap_short && (
              <div>
                <h3 className="font-semibold mb-2 text-sm text-muted-foreground">
                  Context: actieplan
                </h3>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="font-medium mb-1">
                    {project.ap_code} - {project.ap_short}
                  </p>
                  {project.ap_long && (
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                      {project.ap_long}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Beleidsdoelstelling */}
            {project.bd_short && (
              <div>
                <h3 className="font-semibold mb-2 text-sm text-muted-foreground">
                  Context: beleidsdoelstelling
                </h3>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="font-medium mb-1">
                    {project.bd_code} - {project.bd_short}
                  </p>
                  {project.bd_long && (
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                      {project.bd_long}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

export function ProjectDetailModal({
  project,
  isOpen,
  onClose,
  metadata,
  embedded = false,
}: ProjectDetailModalProps) {
  if (embedded) {
    return (
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Projectdetail</p>
            <h2 className="text-2xl font-bold">{project.ac_short}</h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Sluit details"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6">
          <ProjectDetailSections project={project} metadata={metadata} />
        </div>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{project.ac_short}</DialogTitle>
        </DialogHeader>
        <ProjectDetailSections project={project} metadata={metadata} />
      </DialogContent>
    </Dialog>
  )
}
