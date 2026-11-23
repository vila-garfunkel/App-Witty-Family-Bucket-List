export function readInviteCallback(url: URL) {
  const hash = new URLSearchParams(url.hash.slice(1))
  const value = (key: string) => hash.get(key) ?? url.searchParams.get(key)
  return {
    requested: value('type') === 'invite' || url.pathname === '/set-password',
    failed: Boolean(value('error') || value('error_code')),
  }
}

export function needsInvitePassword(user: {
  invited_at?: string
  user_metadata: Record<string, unknown>
}) {
  // This is an onboarding preference, not an authorization or access-control flag.
  return Boolean(user.invited_at) && user.user_metadata.invite_password_set !== true
}
