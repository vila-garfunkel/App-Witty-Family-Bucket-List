export class WorkspaceRequestError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.name = 'WorkspaceRequestError'; this.status = status }
}

export function workspaceError(status: number, body: { error?: unknown } | null) {
  if (status === 404) return new WorkspaceRequestError('You’re signed in, but this feature’s Supabase server route is missing. Deploy the latest server code, then try again.', status)
  if (status === 401) return new WorkspaceRequestError('Your session has expired. Please log out and sign in again.', status)
  return new WorkspaceRequestError(typeof body?.error === 'string' ? body.error : 'Your bucket couldn’t connect. Please try again.', status)
}
