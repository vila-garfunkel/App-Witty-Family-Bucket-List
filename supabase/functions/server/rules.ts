export class RequestError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}
export function assert(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new RequestError(message, status)
}
export function text(value: unknown, max: number, label: string, optional = false) {
  assert(typeof value === 'string', `${label} needs to be text.`)
  const trimmed = value.trim()
  assert((optional || trimmed.length > 0) && trimmed.length <= max, `${label} must be ${optional ? 'at most' : 'between 1 and'} ${max} characters.`)
  return trimmed
}
