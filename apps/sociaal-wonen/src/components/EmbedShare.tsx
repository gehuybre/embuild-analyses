"use client"

import { useState } from "react"
import { Check, Code, Copy } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { embedCode } from "@/lib/embed-snippet"
import type { State, Tab } from "@/lib/types"

const TITLES: Record<Tab, string> = {
  kaart: "Sociale huurplanning: kaart per woonmaatschappij",
  tabel: "Sociale huurplanning: tabel per woonmaatschappij en gemeente",
  projecten: "Sociale huurplanning: projecten korte termijn",
}

export function EmbedShare({ state, section }: { state: State; section: Tab }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const code = open ? embedCode(state, section, TITLES[section]) : ""

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Code className="mr-1.5 h-4 w-4" /> Insluiten
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,34rem)] space-y-2">
        <p className="text-sm">
          Plak deze code op je website. De huidige filters en de gekozen horizon ({state.horizon.toUpperCase()}) zitten erin.
        </p>
        <textarea readOnly value={code} onFocus={(e) => e.currentTarget.select()} rows={9} className="w-full rounded-md border bg-muted/40 p-2 font-mono text-xs" aria-label="Embed-code" />
        <Button type="button" size="sm" onClick={copy}>
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? "Gekopieerd" : "Kopieer code"}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
