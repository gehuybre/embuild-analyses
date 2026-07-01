"use client"

import { EnergiekaartPremiesEmbed } from "@/components/EnergiekaartPremiesEmbed"

export function EnergiekaartPremiesEmbedRouteClient({ section }: { section: string }) {
  return <EnergiekaartPremiesEmbed section={section as any} />
}
