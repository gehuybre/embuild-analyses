"use client"

import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"

interface MapControlsProps {
  /** Callback to zoom in */
  onZoomIn: () => void
  /** Callback to zoom out */
  onZoomOut: () => void
  /** Callback to reset view */
  onReset: () => void
  /** Current zoom level */
  zoom: number
  /** Minimum zoom level (default: 0.5) */
  minZoom?: number
  /** Maximum zoom level (default: 8) */
  maxZoom?: number
  /** Optional class name */
  className?: string
}

export function MapControls({
  onZoomIn,
  onZoomOut,
  onReset,
  zoom,
  minZoom = 0.5,
  maxZoom = 8,
  className,
}: MapControlsProps) {
  const canZoomIn = zoom < maxZoom
  const canZoomOut = zoom > minZoom
  const isDefault = zoom === 1

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className="h-8 w-8"
        aria-label="Zoom in"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className="h-8 w-8"
        aria-label="Zoom uit"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onReset}
        disabled={isDefault}
        className="h-8 w-8"
        aria-label="Reset weergave"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
