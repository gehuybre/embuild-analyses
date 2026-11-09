"use client"

import { X } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Input } from "@embuild/shared/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@embuild/shared/components/ui/select"
import { CATEGORIE_LABELS, PLAATSINGEN } from "@/lib/types"
import type { Gemeente, State, Woonmaatschappij } from "@/lib/types"

const ALL = "__all__"

interface Props {
  state: State
  set: (patch: Partial<State>) => void
  wms: Woonmaatschappij[]
  gemeenten: Gemeente[]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

export function FilterBar({ state, set, wms, gemeenten }: Props) {
  const gemOptions = gemeenten.slice().sort((a, b) => a.naam.localeCompare(b.naam, "nl"))
  const gemName = gemeenten.find((g) => g.nis === state.gemeente)?.naam ?? ""
  const active = state.wm || state.gemeente || state.groep || state.plaatsing

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Woonmaatschappij">
          <Select value={state.wm || ALL} onValueChange={(v) => set({ wm: v === ALL ? "" : v })}>
            <SelectTrigger className="w-full text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle woonmaatschappijen</SelectItem>
              {wms.map((w) => <SelectItem key={w.id} value={w.id}>{w.naam}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Gemeente">
          <Input
            key={state.gemeente}
            list="sw-gemeenten"
            defaultValue={gemName}
            placeholder="Zoek een gemeente"
            className="text-foreground"
            onChange={(e) => {
              const m = gemOptions.find((g) => g.naam.toLowerCase() === e.target.value.trim().toLowerCase())
              if (m) set({ gemeente: m.nis })
              else if (!e.target.value && state.gemeente) set({ gemeente: "" })
            }}
          />
          <datalist id="sw-gemeenten">
            {gemOptions.map((g) => <option key={g.nis} value={g.naam} />)}
          </datalist>
        </Field>
        <Field label="Soort werken">
          <Select value={state.groep || ALL} onValueChange={(v) => set({ groep: v === ALL ? "" : (v as State["groep"]) })}>
            <SelectTrigger className="w-full text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle soorten werken</SelectItem>
              {Object.entries(CATEGORIE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Plaatsingsprocedure">
          <Select value={state.plaatsing || ALL} onValueChange={(v) => set({ plaatsing: v === ALL ? "" : (v as State["plaatsing"]) })}>
            <SelectTrigger className="w-full text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle procedures</SelectItem>
              {PLAATSINGEN.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="button" variant="ghost" size="sm" disabled={!active} onClick={() => set({ wm: "", gemeente: "", groep: "", plaatsing: "" })}>
            <X className="mr-1 h-4 w-4" /> Filters wissen
          </Button>
        </div>
      </div>
    </div>
  )
}
