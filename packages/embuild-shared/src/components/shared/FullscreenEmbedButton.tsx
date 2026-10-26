"use client"

import { Maximize2 } from "lucide-react"
import { Button } from "../ui/button"

interface FullscreenEmbedButtonProps {
  /** Returns the embed URL; called at click time so it reflects the current filters. */
  getUrl: () => string
  className?: string
}

/** Opens the embed URL of a visualisation in a new tab. */
export function FullscreenEmbedButton({ getUrl, className }: FullscreenEmbedButtonProps) {
  return (
    <Button variant="outline" size="sm" title="Volledig scherm" className={className} asChild>
      <a
        href={getUrl()}
        target="_blank"
        rel="noopener noreferrer"
        suppressHydrationWarning
        onClick={(event) => {
          event.currentTarget.href = getUrl()
        }}
        onAuxClick={(event) => {
          event.currentTarget.href = getUrl()
        }}
      >
        <Maximize2 className="h-4 w-4" />
        <span className="hidden sm:inline">Volledig scherm</span>
      </a>
    </Button>
  )
}
