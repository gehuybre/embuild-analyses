import { Suspense } from "react"
import { OctoberEmbed } from "@/components/OctoberEmbed"
import { SECTIONS } from "@/lib/sections"

/** Overzichtspagina: alle embeds onder elkaar, zonder begeleidende tekst. */
export default function Page() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-8">
      {SECTIONS.map((section) => (
        <section key={section} id={section}>
          <Suspense fallback={null}>
            <OctoberEmbed section={section} />
          </Suspense>
        </section>
      ))}
    </main>
  )
}
