export function readRootStreamPayload(value: unknown): unknown | null {
  if (!isRecord(value) || !Object.hasOwn(value, 'namespace')) {
    return value
  }
  if (
    !Array.isArray(value.namespace) ||
    value.namespace.length > 0 ||
    !Object.hasOwn(value, 'data')
  ) {
    return null
  }
  return value.data
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
