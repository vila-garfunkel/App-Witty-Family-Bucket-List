export class WorkspaceRequestError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.name = 'WorkspaceRequestError'; this.status = status }
}

export function workspaceError(status: number, body: { error?: unknown } | null) {
  if (status === 404) return new WorkspaceRequestError('You’re signed in, but the bucket-list service hasn’t been deployed to Supabase yet.', status)
  if (status === 401) return new WorkspaceRequestError('Your session has expired. Please log out and sign in again.', status)
  return new WorkspaceRequestError(typeof body?.error === 'string' ? body.error : 'Your bucket couldn’t connect. Please try again.', status)
}
