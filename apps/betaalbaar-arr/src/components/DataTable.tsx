"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Input } from "@embuild/shared/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@embuild/shared/components/ui/table"
import type { TableColumn } from "./types"

interface DataTableProps {
  data: any[]
  columns: TableColumn[]
}

function formatValue(value: any, format?: "number" | "percentage" | "text"): string {
  if (value == null) return "-"

  switch (format) {
    case "number":
      return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(value)
    case "percentage":
      return `${value.toFixed(1)}%`
    case "text":
    default:
      return String(value)
  }
}

export function DataTable({ data, columns }: DataTableProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  const filteredAndSortedData = useMemo(() => {
    let filtered = data

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(row =>
        columns.some(col =>
          String(row[col.key]).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    }

    // Sort
    if (sortKey) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]

        if (aVal == null) return 1
        if (bVal == null) return -1

        const comparison = typeof aVal === "number"
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal))

        return sortDirection === "asc" ? comparison : -comparison
      })
    }

    return filtered
  }, [data, searchTerm, sortKey, sortDirection, columns])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDirection("asc")
    }
  }

  if (!isExpanded) {
    return (
      <div className="flex justify-center pt-4">
        <Button variant="outline" onClick={() => setIsExpanded(true)}>
          <ChevronDown className="mr-2 h-4 w-4" />
          Toon volledige datatabel ({data.length} rijen)
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Zoek in tabel..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" size="sm" onClick={() => setIsExpanded(false)}>
          <ChevronUp className="mr-2 h-4 w-4" />
          Verberg tabel
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.sortable !== false ? "cursor-pointer select-none" : ""}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div className="flex items-center gap-2">
                    {col.header}
                    {col.sortable !== false && sortKey === col.key && (
                      sortDirection === "asc" ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  Geen resultaten gevonden
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedData.map((row, idx) => (
                <TableRow key={idx}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.align === "right" ? "text-right" : ""}>
                      {formatValue(row[col.key], col.format)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filteredAndSortedData.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          {filteredAndSortedData.length} van {data.length} rijen
        </p>
      )}
    </div>
  )
}
