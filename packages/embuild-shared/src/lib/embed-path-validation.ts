/**
 * Shared validation utilities for embed configuration paths
 *
 * These validators are used both at runtime (development warnings) and
 * build-time (validation script) to ensure consistency.
 */

/**
 * Validation result type
 */
export interface PathValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate that a path doesn't contain traversal patterns
 *
 * @param path - Path to validate
 * @returns Validation result
 */
export function validateNoPathTraversal(path: string): PathValidationResult {
  const errors: string[] = []

  if (path.includes('..')) {
    errors.push('Path contains ".." (parent directory traversal)')
  }

  if (path.includes('~')) {
    errors.push('Path contains "~" (home directory expansion)')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate that a path starts with the expected prefix
 *
 * @param path - Path to validate
 * @param expectedPrefix - Expected prefix (usually the analysis slug)
 * @returns Validation result
 */
export function validatePathPrefix(
  path: string,
  expectedPrefix: string
): PathValidationResult {
  const errors: string[] = []

  if (!path.startsWith(`${expectedPrefix}/`)) {
    errors.push(`Path should start with "${expectedPrefix}/" but is "${path}"`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate a standard embed configuration path
 *
 * Combines multiple validation checks:
 * - No path traversal
 * - Correct prefix (matches analysis slug)
 * - Non-empty
 *
 * @param path - Path to validate
 * @param pathType - Type of path ("dataPath" or "municipalitiesPath")
 * @param slug - Analysis slug (for prefix validation)
 * @returns Validation result
 */
export function validateEmbedPath(
  path: string,
  pathType: string,
  slug: string
): PathValidationResult {
  const errors: string[] = []

  // Check non-empty
  if (!path || path.trim() === '') {
    errors.push(`${pathType} is required and must not be empty`)
    return { valid: false, errors }
  }

  // Check for path traversal
  const traversalResult = validateNoPathTraversal(path)
  if (!traversalResult.valid) {
    errors.push(...traversalResult.errors)
  }

  // Check path prefix
  const prefixResult = validatePathPrefix(path, slug)
  if (!prefixResult.valid) {
    errors.push(...prefixResult.errors)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
