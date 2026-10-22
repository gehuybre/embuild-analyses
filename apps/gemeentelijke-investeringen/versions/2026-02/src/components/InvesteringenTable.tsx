"use client"

import React, { useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@embuild/shared/components/ui/table"
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from "@embuild/shared/components/ui/button"

interface TableData {
  domain: string
  total: number
  average: number
  count: number
}

interface InvesteringenTableProps {
  data: TableData[]
  label?: string
}

const formatNumber = (num: number) => new Intl.NumberFormat('nl-BE').format(Math.round(num))
const formatCurrency = (num: number) => `€ ${formatNumber(num)}`

type SortKey = 'domain' | 'total' | 'average' | 'count'
type SortDirection = 'asc' | 'desc' | null

export function InvesteringenTable({ data, label = "Domein" }: InvesteringenTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'desc') {
        setSortDirection('asc')
      } else if (sortDirection === 'asc') {
        setSortDirection(null)
        setSortKey('total')
      } else {
        setSortDirection('desc')
      }
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const sortedData = useMemo(() => {
    if (!sortDirection) return data

    return [...data].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      return 0
    })
  }, [data, sortKey, sortDirection])

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-4 w-4" />
    if (sortDirection === 'asc') return <ArrowUp className="h-4 w-4" />
    if (sortDirection === 'desc') return <ArrowDown className="h-4 w-4" />
    return <ArrowUpDown className="h-4 w-4" />
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 font-semibold"
                onClick={() => handleSort('domain')}
              >
                {label}
                <SortIcon column="domain" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 font-semibold"
                onClick={() => handleSort('total')}
              >
                Totaal
                <SortIcon column="total" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 font-semibold"
                onClick={() => handleSort('average')}
              >
                Gemiddelde
                <SortIcon column="average" />
              </Button>
            </TableHead>
            <TableHead className="text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 font-semibold"
                onClick={() => handleSort('count')}
              >
                Aantal
                <SortIcon column="count" />
              </Button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{row.domain}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(row.total)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(row.average)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(row.count)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
