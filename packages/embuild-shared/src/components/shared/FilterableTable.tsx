"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table"

type UnknownRecord = Record<string, any>

interface FilterableTableProps<TData = UnknownRecord> {
  data: TData[]
  metric?: string
  label?: string
  periodHeaders?: string[]
}

export function FilterableTable<TData = UnknownRecord>({
  data,
  metric,
  label = "Aantal",
  periodHeaders,
}: FilterableTableProps<TData>) {
  const hasSortValue = data.some((d: any) => typeof d?.sortValue === "number")
  const sortedData = [...data]
  const yearColumnKeys = Array.from(
    new Set(
      data.flatMap((row: any) =>
        Object.keys(row ?? {}).filter((key) => /^y\d{4}$/.test(key))
      )
    )
  ).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  const hasYearColumns = yearColumnKeys.length > 0

  if (hasSortValue) {
    sortedData.sort((a: any, b: any) => (a.sortValue as number) - (b.sortValue as number))
    sortedData.reverse()
  } else {
    // Best-effort default: keep incoming order but show newest first.
    sortedData.reverse()
  }

  const hasPeriodCells = sortedData.some((d: any) => Array.isArray(d?.periodCells))
  const baseHeaders = hasPeriodCells
    ? (periodHeaders ?? ["Periode"])
    : ["Jaar", "Kwartaal"]
  const headers = hasYearColumns ? [...baseHeaders, ...yearColumnKeys.map((key) => key.slice(1))] : baseHeaders

  return (
    <div className="max-h-[400px] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h, i) => (
              <TableHead key={i}>{h}</TableHead>
            ))}
            {!hasYearColumns && <TableHead className="text-right">{label}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((d, i) => (
            <TableRow key={i}>
              {Array.isArray((d as any)?.periodCells) ? (
                (d as any).periodCells.map((c: any, j: number) => <TableCell key={j}>{c}</TableCell>)
              ) : (
                <>
                  <TableCell>{(d as any).y}</TableCell>
                  <TableCell>Q{(d as any).q}</TableCell>
                </>
              )}
              {hasYearColumns ? (
                yearColumnKeys.map((key) => (
                  <TableCell key={key} className="text-right">
                    {(d as any)?.[key] ?? ""}
                  </TableCell>
                ))
              ) : (
                <TableCell className="text-right">
                  {(d as any)?.formattedValue ??
                    (typeof (d as any)?.value === "number"
                      ? (d as any).value
                      : metric
                        ? (d as any)?.[metric]
                        : (d as any)?.value)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
