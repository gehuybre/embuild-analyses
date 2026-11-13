import {
  ALL_PROGRAMS,
  EXTERNAL_FINANCING_PROJECTS,
  MONEY_EPSILON,
  RECONCILIATION_STATUS_LABELS,
  RECONCILIATION_STATUS_ORDER,
  type GipBundle,
  type GipProject,
  type ReconciliationStatus,
} from "./model"

export type ProjectAccumulator = Pick<
  GipProject,
  "id" | "programma" | "subprogramma" | "entiteit" | "project" | "deelproject" | "locatie"
> & {
  budget2025: number
  budget2026: number
  budget2027: number
  budget_total: number
}

export type ReconciledProject = {
  key: string
  id: string
  oldProgramma: string
  newProgramma: string
  programma: string
  subprogramma: string
  entiteit: string
  project: string
  deelproject: string
  oldProjectName: string
  oldDeelproject: string
  newProjectName: string
  newDeelproject: string
  locatie: string
  old2025: number
  old2026: number
  old2027: number
  oldTotal: number
  new2026: number
  delta2026: number
  envelopeDelta: number
  status: ReconciliationStatus
}

export type ReconciliationCategoryRow = {
  status: ReconciliationStatus
  label: string
  count: number
  old2026: number
  new2026: number
  delta2026: number
  deltaMio: number
}

export function normalizeForReconciliation(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function tokenSetForReconciliation(value: string) {
  return new Set(
    normalizeForReconciliation(value)
      .split(" ")
      .filter((token) => token.length > 1)
  )
}

export function tokenSimilarity(left: string, right: string) {
  const leftTokens = tokenSetForReconciliation(left)
  const rightTokens = tokenSetForReconciliation(right)
  if (!leftTokens.size || !rightTokens.size) return 0

  let intersection = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1
  })

  return intersection / (leftTokens.size + rightTokens.size - intersection)
}

export function containsNormalizedName(left: string, right: string) {
  const normalizedLeft = normalizeForReconciliation(left)
  const normalizedRight = normalizeForReconciliation(right)
  if (normalizedLeft.length < 8 || normalizedRight.length < 8) return false
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
}

export function reconciliationKey(project: GipProject) {
  return [project.entiteit, project.project, project.deelproject]
    .map((value) => normalizeForReconciliation(value ?? ""))
    .join("||")
}

export function groupProjectsForReconciliation(projects: GipProject[]) {
  const grouped = new Map<string, ProjectAccumulator>()

  projects.forEach((project) => {
    const key = reconciliationKey(project)
    const existing = grouped.get(key)
    const row =
      existing ??
      {
        id: project.id,
        programma: project.programma,
        subprogramma: project.subprogramma,
        entiteit: project.entiteit,
        project: project.project,
        deelproject: project.deelproject,
        locatie: project.locatie,
        budget2025: 0,
        budget2026: 0,
        budget2027: 0,
        budget_total: 0,
      }

    row.budget2025 += project.budget2025
    row.budget2026 += project.budget2026
    row.budget2027 += project.budget2027
    row.budget_total += project.budget_total
    if (!row.locatie && project.locatie) row.locatie = project.locatie
    grouped.set(key, row)
  })

  return grouped
}

export function sameMoney(left: number, right: number) {
  return Math.abs(left - right) <= MONEY_EPSILON
}

export function renameCandidateScore(oldProject: ProjectAccumulator, newProject: ProjectAccumulator) {
  if (!sameMoney(oldProject.budget2026, newProject.budget2026)) return 0

  const oldName = `${oldProject.project} ${oldProject.deelproject}`
  const newName = `${newProject.project} ${newProject.deelproject}`
  const nameScore = containsNormalizedName(oldName, newName) ? 1 : tokenSimilarity(oldName, newName)
  const contextScore = tokenSimilarity(
    `${oldProject.programma} ${oldProject.subprogramma} ${oldProject.entiteit} ${oldProject.locatie}`,
    `${newProject.programma} ${newProject.subprogramma} ${newProject.entiteit} ${newProject.locatie}`
  )
  const sameEntity = normalizeForReconciliation(oldProject.entiteit) === normalizeForReconciliation(newProject.entiteit)
  const sameProgram =
    normalizeForReconciliation(oldProject.programma) === normalizeForReconciliation(newProject.programma)

  if (nameScore >= 0.5) return nameScore + contextScore * 0.25
  if (nameScore >= 0.32 && (sameEntity || sameProgram)) return nameScore + contextScore * 0.25 + 0.1
  return 0
}

export function classifyMatchedProject(oldProject: ProjectAccumulator, newProject: ProjectAccumulator): ReconciliationStatus {
  const old2025 = oldProject.budget2025
  const old2026 = oldProject.budget2026
  const old2027 = oldProject.budget2027
  const oldTotal = old2025 + old2026 + old2027
  const new2026 = newProject.budget2026
  const delta = new2026 - old2026

  if (Math.abs(delta) <= MONEY_EPSILON) return "unchanged"
  if (delta < 0) return "decrease_or_delay"
  if (new2026 <= old2026 + old2025 + MONEY_EPSILON) return "delayed_from_2025"
  if (new2026 <= old2026 + old2027 + MONEY_EPSILON) return "pulled_forward"
  if (new2026 <= oldTotal + MONEY_EPSILON) return "within_envelope"
  return "budget_increase"
}

export function buildReconciledProject(
  key: string,
  oldProject: ProjectAccumulator | undefined,
  newProject: ProjectAccumulator | undefined,
  status: ReconciliationStatus
): ReconciledProject {
  const old2025 = oldProject?.budget2025 ?? 0
  const old2026 = oldProject?.budget2026 ?? 0
  const old2027 = oldProject?.budget2027 ?? 0
  const oldTotal = old2025 + old2026 + old2027
  const new2026 = newProject?.budget2026 ?? 0
  const source = newProject ?? oldProject

  return {
    key,
    id: source?.id ?? key,
    oldProgramma: oldProject?.programma ?? "",
    newProgramma: newProject?.programma ?? "",
    programma: newProject?.programma || oldProject?.programma || "",
    subprogramma: newProject?.subprogramma || oldProject?.subprogramma || "",
    entiteit: newProject?.entiteit || oldProject?.entiteit || "",
    project: newProject?.project || oldProject?.project || "",
    deelproject: newProject?.deelproject || oldProject?.deelproject || "",
    oldProjectName: oldProject?.project ?? "",
    oldDeelproject: oldProject?.deelproject ?? "",
    newProjectName: newProject?.project ?? "",
    newDeelproject: newProject?.deelproject ?? "",
    locatie: newProject?.locatie || oldProject?.locatie || "",
    old2025,
    old2026,
    old2027,
    oldTotal,
    new2026,
    delta2026: new2026 - old2026,
    envelopeDelta: new2026 - oldTotal,
    status,
  }
}

export function buildBudgetReconciliation(gip2025: GipBundle, gip2026: GipBundle) {
  const oldProjects = groupProjectsForReconciliation(gip2025.projects)
  const newProjects = groupProjectsForReconciliation(gip2026.projects)
  const rows: ReconciledProject[] = []
  const oldOnly = new Map<string, ProjectAccumulator>()
  const newOnly = new Map<string, ProjectAccumulator>()

  oldProjects.forEach((oldProject, key) => {
    const newProject = newProjects.get(key)
    if (newProject) {
      if (oldProject.budget2026 > MONEY_EPSILON || newProject.budget2026 > MONEY_EPSILON) {
        rows.push(buildReconciledProject(key, oldProject, newProject, classifyMatchedProject(oldProject, newProject)))
      }
      return
    }

    if (oldProject.budget2026 > MONEY_EPSILON) {
      oldOnly.set(key, oldProject)
    }
  })

  newProjects.forEach((newProject, key) => {
    if (!oldProjects.has(key) && newProject.budget2026 > MONEY_EPSILON) {
      newOnly.set(key, newProject)
    }
  })

  const pairedOldKeys = new Set<string>()
  const pairedNewKeys = new Set<string>()

  oldOnly.forEach((oldProject, oldKey) => {
    let bestKey = ""
    let bestProject: ProjectAccumulator | null = null
    let bestScore = 0

    newOnly.forEach((newProject, newKey) => {
      if (pairedNewKeys.has(newKey)) return
      const score = renameCandidateScore(oldProject, newProject)
      if (score > bestScore) {
        bestScore = score
        bestKey = newKey
        bestProject = newProject
      }
    })

    if (bestProject && bestScore >= 0.42) {
      pairedOldKeys.add(oldKey)
      pairedNewKeys.add(bestKey)
      rows.push(buildReconciledProject(`renamed:${oldKey}:${bestKey}`, oldProject, bestProject, "unchanged"))
    }
  })

  oldOnly.forEach((oldProject, key) => {
    if (!pairedOldKeys.has(key)) {
      rows.push(buildReconciledProject(key, oldProject, undefined, "removed_or_renamed"))
    }
  })

  newOnly.forEach((newProject, key) => {
    if (!pairedNewKeys.has(key)) {
      rows.push(buildReconciledProject(key, undefined, newProject, "new_or_renamed"))
    }
  })

  return rows.sort((a, b) => Math.abs(b.delta2026) - Math.abs(a.delta2026))
}

export function filterReconciliationByProgram(rows: ReconciledProject[], selectedProgram: string) {
  if (selectedProgram === ALL_PROGRAMS) return rows
  return rows.filter(
    (row) =>
      row.programma === selectedProgram ||
      row.oldProgramma === selectedProgram ||
      row.newProgramma === selectedProgram
  )
}

export function buildReconciliationCategoryRows(rows: ReconciledProject[]): ReconciliationCategoryRow[] {
  return RECONCILIATION_STATUS_ORDER.map((status) => {
    const statusRows = rows.filter((row) => row.status === status)
    const old2026 = statusRows.reduce((sum, row) => sum + row.old2026, 0)
    const new2026 = statusRows.reduce((sum, row) => sum + row.new2026, 0)
    const delta2026 = new2026 - old2026

    return {
      status,
      label: RECONCILIATION_STATUS_LABELS[status],
      count: statusRows.length,
      old2026,
      new2026,
      delta2026,
      deltaMio: delta2026 / 1_000_000,
    }
  }).filter((row) => row.count > 0)
}

export function isExternalFinancingRow(row: ReconciledProject) {
  return EXTERNAL_FINANCING_PROJECTS.has(row.project)
}

export function truncateLabel(value: string, maxLength = 56) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}


