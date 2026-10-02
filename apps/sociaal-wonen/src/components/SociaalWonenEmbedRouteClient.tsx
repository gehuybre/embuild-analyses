"use client"

import { EmbedAutoResize } from "@embuild/shared/components/shared/EmbedAutoResize"
import { EmbedErrorBoundary } from "@embuild/shared/components/shared/EmbedErrorBoundary"
import type { Tab } from "@/lib/types"
import { SociaalWonenDashboard } from "./SociaalWonenDashboard"

export function SociaalWonenEmbedRouteClient({ section }: { section: Tab }) {
  return (
    <EmbedErrorBoundary>
      <main className="min-h-screen bg-background p-3">
        <SociaalWonenDashboard section={section} />
      </main>
      <EmbedAutoResize />
    </EmbedErrorBoundary>
  )
}
