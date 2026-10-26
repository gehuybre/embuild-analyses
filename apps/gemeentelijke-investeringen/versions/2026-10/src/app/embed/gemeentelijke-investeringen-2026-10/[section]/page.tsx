import { Suspense } from "react"
import { notFound } from "next/navigation"
import { OctoberEmbed } from "@/components/OctoberEmbed"
import { SECTIONS } from "@/lib/sections"

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  const section = SECTIONS.find((value) => value === params.section)
  if (!section) notFound()
  return <Suspense fallback={null}><OctoberEmbed section={section} /></Suspense>
}
