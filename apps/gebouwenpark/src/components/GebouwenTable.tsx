"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@embuild/shared/components/ui/table"

interface TableDataPoint {
  year: number
  total: number
  residential: number
}

interface GebouwenTableProps {
  data: TableDataPoint[]
  totalLabel?: string
  residentialLabel?: string
  showBothColumns?: boolean
}

const formatNumber = (num: number) => new Intl.NumberFormat('nl-BE').format(num)

export function GebouwenTable({
  data,
  totalLabel = "Totaal Gebouwen",
  residentialLabel = "Woongebouwen",
  showBothColumns = true
}: GebouwenTableProps) {
  // Sort by year descending for table view
  const sortedData = [...data].sort((a, b) => b.year - a.year)

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jaar</TableHead>
            <TableHead className="text-right">{totalLabel}</TableHead>
            {showBothColumns && (
              <TableHead className="text-right">{residentialLabel}</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row) => (
            <TableRow key={row.year}>
              <TableCell className="font-medium">{row.year}</TableCell>
              <TableCell className="text-right">{formatNumber(row.total)}</TableCell>
              {showBothColumns && (
                <TableCell className="text-right">{formatNumber(row.residential)}</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
