"use client"

import { useMemo } from "react"
import { X } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Input } from "@embuild/shared/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@embuild/shared/components/ui/select"
import { PROVINCIES, PROVINCIE_LABEL, TYPE_ORDER } from "@/lib/types"
import type { Gemeente, Meta, State, Woonmaatschappij } from "@/lib/types"

const ALL = "__all__"

interface Props {
  state: State
  set: (patch: Partial<State>) => void
  wms: Woonmaatschappij[]
  gemeenten: Gemeente[]
  meta: Meta
  procedures: string[]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

export function FilterBar({ state, set, wms, gemeenten, meta, procedures }: Props) {
  const gemOptions = useMemo(
    () => gemeenten.filter((g) => !state.provincie || g.provincie === state.provincie).sort((a, b) => a.naam.localeCompare(b.naam, "nl")),
    [gemeenten, state.provincie]
  )
  const gemName = gemeenten.find((g) => g.nis === state.gemeente)?.naam ?? ""
  const active = state.wm || state.provincie || state.gemeente || state.groep || state.type || state.procedure

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
        <Field label="Provincie">
          <Select value={state.provincie || ALL} onValueChange={(v) => set({ provincie: v === ALL ? "" : v, gemeente: "" })}>
            <SelectTrigger className="w-full text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle provincies</SelectItem>
              {PROVINCIES.map((p) => <SelectItem key={p} value={p}>{PROVINCIE_LABEL[p]}</SelectItem>)}
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
          <Select value={state.groep || ALL} onValueChange={(v) => set({ groep: v === ALL ? "" : (v as State["groep"]), type: "" })}>
            <SelectTrigger className="w-full text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Nieuwbouw en renovatie</SelectItem>
              <SelectItem value="nieuwbouw">Nieuwbouw (blad FS4 Nieuwbouw)</SelectItem>
              <SelectItem value="renovatie">Renovatie (blad FS4 Renovatie)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Type verrichting">
          <Select value={state.type || ALL} onValueChange={(v) => set({ type: v === ALL ? "" : v })}>
            <SelectTrigger className="w-full text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle types</SelectItem>
              {TYPE_ORDER.filter((t) => t !== "ONBEKEND").map((t) => (
                <SelectItem key={t} value={t}>{t}: {meta.types[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Procedure">
          <Select value={state.procedure || ALL} onValueChange={(v) => set({ procedure: v === ALL ? "" : v })}>
            <SelectTrigger className="w-full text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle procedures</SelectItem>
              {procedures.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="button" variant="ghost" size="sm" disabled={!active} onClick={() => set({ wm: "", provincie: "", gemeente: "", groep: "", type: "", procedure: "" })}>
            <X className="mr-1 h-4 w-4" /> Filters wissen
          </Button>
        </div>
      </div>
    </div>
  )
}
