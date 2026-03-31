"use client"

interface MeasureFilterProps {
  measures: string[]
  selectedMeasure: string
  onMeasureChange: (measure: string) => void
}

export function MeasureFilter({
  measures,
  selectedMeasure,
  onMeasureChange,
}: MeasureFilterProps) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="measure-select" className="text-sm font-medium">
        Maatregel:
      </label>
      <select
        id="measure-select"
        value={selectedMeasure}
        onChange={(e) => onMeasureChange(e.target.value)}
        className="w-[300px] px-3 py-2 border rounded-md bg-background"
      >
        {measures.map((measure) => (
          <option key={measure} value={measure}>
            {measure}
          </option>
        ))}
      </select>
    </div>
  )
}
