"use client"

import { GebouwenparkEmbed } from "@/components/GebouwenparkEmbed"

export function GebouwenparkEmbedRouteClient({ section }: { section: string }) {
  return <GebouwenparkEmbed section={section as any} />
}
