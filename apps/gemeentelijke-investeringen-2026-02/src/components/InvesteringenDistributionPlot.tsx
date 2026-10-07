"use client"

import React, { useMemo } from 'react'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
    Label,
} from 'recharts'
import {
    createAutoScaledFormatter,
    createYAxisLabel,
    formatScaledTooltipValue,
} from "@embuild/shared/lib/number-formatters"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"

interface DataPoint {
    municipality: string
    NIS_code: string
    value: number
}

interface BinData {
    binIndex: number
    min: number
    max: number
    count: number
    isHighlighted: boolean
    medianValue: number
    percentileLabel: string
}

interface InvesteringenDistributionPlotProps {
    data: DataPoint[]
    selectedMetric: 'Totaal' | 'Per_inwoner'
    selectedMunicipality: string | null
    color?: string
}

export function InvesteringenDistributionPlot({
    data,
    selectedMetric,
    selectedMunicipality,
    color = CHART_SERIES_COLORS[0]
}: InvesteringenDistributionPlotProps) {
    const highlightColor = CHART_SERIES_COLORS[4]
    // Define bins for the histogram
    const BIN_COUNT = 20

    const { bins, selectedMuniValue, selectedMuniName, yMax } = useMemo((): {
        bins: BinData[]
        selectedMuniValue: number | null
        selectedMuniName: string | null
        yMax: number
    } => {
        if (data.length === 0) return { bins: [], selectedMuniValue: null, selectedMuniName: null, yMax: 0 }

        const values = data.map(d => d.value)
        const min = 0 // Always start from 0 for consistency
        const max = Math.max(...values) * 1.05 // Add 5% padding

        // Edge case: if all values are 0 or max is 0, return empty bins
        if (max === 0) {
            return { bins: [], selectedMuniValue: null, selectedMuniName: null, yMax: 0 }
        }

        const binSize = max / BIN_COUNT
        const bins = Array.from({ length: BIN_COUNT }, (_, i) => ({
            binIndex: i,
            min: i * binSize,
            max: (i + 1) * binSize,
            count: 0,
            isHighlighted: false,
            medianValue: 0,
            percentileLabel: `${i * 5}-${(i + 1) * 5}%`,
        }))

        // Distribute data points into bins and calculate counts
        for (const point of data) {
            const binIdx = Math.min(Math.floor(point.value / binSize), BIN_COUNT - 1)
            bins[binIdx].count++
        }

        // Calculate median value for each bin
        for (let i = 0; i < bins.length; i++) {
            const binData = data.filter(d => {
                const binIdx = Math.min(Math.floor(d.value / binSize), BIN_COUNT - 1)
                return binIdx === i
            })
            if (binData.length > 0) {
                const sorted = binData.map(d => d.value).sort((a, b) => a - b)
                const mid = Math.floor(sorted.length / 2)
                bins[i].medianValue = sorted.length % 2 === 0
                    ? (sorted[mid - 1] + sorted[mid]) / 2
                    : sorted[mid]
            }
        }

        let selectedMuniValue = null
        let selectedMuniName = null

        if (selectedMunicipality) {
            const muni = data.find(d => d.NIS_code === selectedMunicipality)
            if (muni) {
                selectedMuniValue = muni.value
                selectedMuniName = muni.municipality
                const binIdx = Math.min(Math.floor(selectedMuniValue / binSize), BIN_COUNT - 1)
                bins[binIdx].isHighlighted = true
            }
        }

        const yMax = Math.max(...bins.map(b => b.medianValue))

        return { bins, selectedMuniValue, selectedMuniName, yMax }
    }, [data, selectedMunicipality])

    // Formatters
    const { formatter: valueFormatter, scaleLabel, scaleUnit } = useMemo(() => {
        const values = data.map(d => d.value)
        return createAutoScaledFormatter(values, selectedMetric === 'Totaal')
    }, [data, selectedMetric])

    // Y-axis label
    const yAxisLabel = useMemo(() => {
        const baseLabel = selectedMetric === 'Totaal' ? 'Investering' : 'Investering per inwoner'
        return createYAxisLabel(baseLabel, scaleLabel, true)
    }, [selectedMetric, scaleLabel])

    const formatTooltipValue = (val: number) => {
        return formatScaledTooltipValue(val, valueFormatter, scaleUnit)
    }

    interface TooltipProps {
        active?: boolean
        payload?: Array<{
            payload: BinData
        }>
    }

    const CustomTooltip = ({ active, payload }: TooltipProps) => {
        if (active && payload && payload.length) {
            const bin = payload[0].payload
            return (
                <div className="bg-background border border-border rounded-md shadow-lg p-3 text-sm">
                    <p className="font-bold mb-1">Percentiel Groep ({bin.percentileLabel})</p>
                    <p className="text-muted-foreground">
                        Bereik: {formatTooltipValue(bin.min)} - {formatTooltipValue(bin.max)}
                    </p>
                    <p className="font-medium mt-1">
                        Mediaan in deze groep: <span className="text-primary">{formatTooltipValue(bin.medianValue)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        ({bin.count} gemeenten in deze schijf)
                    </p>
                    {bin.isHighlighted && selectedMuniName && (
                        <p className="text-destructive font-medium mt-2 border-t pt-1">
                            Inclusief {selectedMuniName} ({formatTooltipValue(selectedMuniValue!)})
                        </p>
                    )}
                </div>
            )
        }
        return null
    }

    return (
        <div className="w-full h-full flex flex-col">
            <div className="text-sm text-muted-foreground mb-1 ml-12">
                {yAxisLabel.text}
                <span className="font-bold">{yAxisLabel.boldText}</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bins} margin={{ top: 20, right: 30, bottom: 60, left: 40 }}>
                    <XAxis
                        dataKey="percentileLabel"
                        label={{ value: 'Percentiel (groepen van 5% van alle gemeenten)', position: 'insideBottom', offset: -10 }}
                    />
                    <YAxis
                        tickFormatter={valueFormatter}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                    <Bar dataKey="medianValue">
                        {bins.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.isHighlighted ? highlightColor : color}
                                fillOpacity={0.8}
                            />
                        ))}
                    </Bar>
                    {selectedMuniValue !== null && (
                        <ReferenceLine
                            y={selectedMuniValue}
                            stroke={highlightColor}
                            strokeWidth={2}
                            strokeDasharray="3 3"
                        >
                            <Label
                                value={selectedMuniName || ''}
                                position="right"
                                fill={highlightColor}
                                fontSize={12}
                                className="font-bold"
                            />
                        </ReferenceLine>
                    )}
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
