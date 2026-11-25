import { GIPDashboard } from "@/components/GIPDashboard"

const SECTIONS = ["overview", "projects", "map", "large"] as const

/** Overzichtspagina: alle embeds onder elkaar, zonder begeleidende tekst. "reconciliation" geeft dezelfde weergave als "overview" en is weggelaten. */
export default function Page() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8">
      {SECTIONS.map((section) => (
        <section key={section} id={section}>
          <GIPDashboard embeddedSection={section} />
        </section>
      ))}
    </main>
  )
}
