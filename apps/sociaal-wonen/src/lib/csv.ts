function cell(v: string | number | null | undefined): string {
  const t = v == null ? "" : String(v)
  return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function downloadCsv(
  filename: string,
  comments: string[],
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
) {
  const csv = [
    ...comments.map((c) => `# ${c}`),
    headers.map(cell).join(","),
    ...rows.map((r) => r.map(cell).join(",")),
  ].join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
