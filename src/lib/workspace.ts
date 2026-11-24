import { supabase } from './supabase'
import { projectId } from '../../utils/supabase/info'
import { workspaceError } from './workspace-errors'
export type { Workspace, Wish } from '../../supabase/functions/server/domain'
import type { Workspace } from '../../supabase/functions/server/domain'

const base = `https://${projectId}.supabase.co/functions/v1/make-server-a728503c`
export async function request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw workspaceError(401, null)
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw workspaceError(response.status, result)
  return result as T
}
export const loadWorkspace = () => request<Workspace>('/workspace')
export const runAction = (action: Record<string, unknown>) => request<Workspace>('/action', action)
