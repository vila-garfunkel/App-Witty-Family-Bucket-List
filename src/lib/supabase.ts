import { createClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from '../../utils/supabase/info'
import { readInviteCallback } from './invite'

// Capture the link's intent before the SDK consumes and removes the auth fragment.
export const inviteCallback: ReturnType<typeof readInviteCallback> = import.meta.hot?.data.inviteCallback ?? readInviteCallback(new URL(window.location.href))
// Reuse the client during hot reload so auth locks, refreshes, and listeners
// don't compete over the same stored session.
export const supabase: ReturnType<typeof createClient> = import.meta.hot?.data.supabase
  ?? createClient(`https://${projectId}.supabase.co`, publicAnonKey)
if (import.meta.hot) {
  import.meta.hot.data.supabase = supabase
  import.meta.hot.data.inviteCallback = inviteCallback
}
