"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@embuild/shared/components/ui/table"

import { formatScaledEuro, getCurrencyScale } from "./formatters"

interface TableDataPoint {
  jaar: number
  value: number
}

interface EnergiekaartTableProps {
  data: TableDataPoint[]
  label: string
  isCurrency?: boolean
}

export function EnergiekaartTable({ data, label, isCurrency = false }: EnergiekaartTableProps) {
  const scale = isCurrency ? getCurrencyScale(data.map((d) => d.value)) : null

  const formatValue = (value: number) => {
    if (isCurrency) {
      if (!scale) return `€ ${value}`
      return formatScaledEuro(value, scale)
    }
    return new Intl.NumberFormat("nl-BE").format(value)
  }

  // Sort by year descending (most recent first)
  const sortedData = [...data].sort((a, b) => b.jaar - a.jaar)

  return (
    <div className="h-[400px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jaar</TableHead>
            <TableHead className="text-right">{label}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row) => (
            <TableRow key={row.jaar}>
              <TableCell className="font-medium">{row.jaar}</TableCell>
              <TableCell className="text-right">{formatValue(row.value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
