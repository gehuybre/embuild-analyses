"use client"

import type { ReactNode } from "react"

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = "quiet",
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  label: string
  tone?: "primary" | "quiet"
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-1 rounded-md border bg-muted/40 p-1"
    >
      {options.map((option) => {
        const active = option.value === value
        const activeClass =
          tone === "primary"
            ? "bg-[#4F868F] text-white shadow-sm"
            : "bg-background text-foreground shadow-sm"
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-[5px] px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out ${
              active ? activeClass : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function SectionHeading({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">{children}</div>
}
