"use client"

import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { ExportButtons } from "./ExportButtons"

type ExportRow = {
  label: string
  value: number
  periodCells?: Array<string | number>
}

type ViewType = "chart" | "table" | "map"

type TimeSeriesView = {
  value: string
  label: string
  content: React.ReactNode
  exportData?: ExportRow[]
  exportMeta?: {
    viewType?: ViewType
    periodHeaders?: string[]
    valueLabel?: string
    embedParams?: Record<string, string | number | null | undefined>
  }
}

export function TimeSeriesSection({
  title,
  slug,
  sectionId,
  dataSource,
  dataSourceUrl,
  defaultView,
  headerContent,
  rightControls,
  views,
}: {
  title: string
  slug?: string
  sectionId?: string
  dataSource?: string
  dataSourceUrl?: string
  defaultView: string
  headerContent?: React.ReactNode
  rightControls?: React.ReactNode
  views: TimeSeriesView[]
}) {
  const [currentView, setCurrentView] = React.useState<string>(defaultView)

  const activeView = React.useMemo(() => {
    return views.find((v) => v.value === currentView) ?? views[0]
  }, [views, currentView])

  const canExport = Boolean(slug && sectionId && activeView?.exportData?.length)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        {canExport && (
          <ExportButtons
            data={activeView.exportData!}
            title={title}
            slug={slug!}
            sectionId={sectionId!}
            viewType={activeView.exportMeta?.viewType ?? "chart"}
            periodHeaders={activeView.exportMeta?.periodHeaders}
            valueLabel={activeView.exportMeta?.valueLabel}
            dataSource={dataSource}
            dataSourceUrl={dataSourceUrl}
            embedParams={activeView.exportMeta?.embedParams}
          />
        )}
      </div>

      {headerContent}

      <Tabs defaultValue={defaultView} onValueChange={setCurrentView}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <TabsList>
            {views.map((v) => (
              <TabsTrigger key={v.value} value={v.value}>
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {rightControls ? <div className="flex items-center gap-2">{rightControls}</div> : null}
        </div>

        {views.map((v) => (
          <TabsContent key={v.value} value={v.value}>
            {v.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

