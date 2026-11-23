import { createClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from '../../utils/supabase/info'
import { readInviteCallback } from './invite'

// Capture the link's intent before the SDK consumes and removes the auth fragment.
export const inviteCallback = readInviteCallback(new URL(window.location.href))
export const supabase = createClient(`https://${projectId}.supabase.co`, publicAnonKey)
