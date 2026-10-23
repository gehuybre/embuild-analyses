"use client"

import * as React from "react"
import { calendarDate, daysInMonth } from "@/lib/price-revision"

const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
const selectClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"

export function CalculatorDateInput({ label, value, onChange }: {
  label: string; value: string; onChange: (value: string) => void
}) {
  const [parts, setParts] = React.useState(() => value ? value.split("-") : ["", "", ""])
  const [year, month, day] = parts
  const lastYear = Math.max(new Date().getFullYear() + 2, Number(value.slice(0, 4)) || 0)
  const lastDay = year && month ? daysInMonth(Number(year), Number(month)) : 31

  const changePart = (index: number, nextValue: string) => {
    const next = parts.map((part, i) => i === index ? nextValue : part)
    const date = calendarDate(next[0], next[1], next[2])
    if (date) next[2] = date.slice(8, 10)
    setParts(next)
    onChange(date)
  }

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <select className={selectClass} aria-label={`${label}: dag`} value={day} onChange={event => changePart(2, event.target.value)}>
          <option value="">Dag</option>
          {Array.from({ length: lastDay }, (_, i) => String(i + 1).padStart(2, "0")).map(option => <option key={option} value={option}>{Number(option)}</option>)}
        </select>
        <select className={selectClass} aria-label={`${label}: maand`} value={month} onChange={event => changePart(1, event.target.value)}>
          <option value="">Maand</option>
          {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, "0")}>{name}</option>)}
        </select>
        <select className={selectClass} aria-label={`${label}: jaar`} value={year} onChange={event => changePart(0, event.target.value)}>
          <option value="">Jaar</option>
          {Array.from({ length: lastYear - 2007 + 1 }, (_, i) => String(lastYear - i)).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Kies dag, maand en jaar rechtstreeks.
        {value ? ` Geselecteerd: ${value.split("-").reverse().join("/")}.` : ""}
      </p>
    </fieldset>
  )
}
