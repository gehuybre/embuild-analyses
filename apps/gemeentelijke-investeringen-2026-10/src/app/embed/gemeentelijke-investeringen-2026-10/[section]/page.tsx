import { Suspense } from "react"
import { notFound } from "next/navigation"
import { OctoberEmbed } from "@/components/OctoberEmbed"

const sections = ["investments-yearly-actual", "investments-yearly-latest", "investments-yearly-original"] as const

export function generateStaticParams() {
  return sections.map((section) => ({ section }))
}

export default function Page({ params }: { params: { section: string } }) {
  const section = sections.find((value) => value === params.section)
  if (!section) notFound()
  return <Suspense fallback={null}><OctoberEmbed section={section} /></Suspense>
}
