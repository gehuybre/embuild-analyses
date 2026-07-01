"use client"

import { SilcEnergieEmbed } from "@/components/SilcEnergieEmbed"

export function SilcEnergieEmbedRouteClient({ section }: { section: string }) {
  return <SilcEnergieEmbed section={section as any} />
}
