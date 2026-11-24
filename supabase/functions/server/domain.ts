import { addSeat, closeSeat, cooldownMessage, ensureFamilyThread, upgradeChat, baseName, type Thread } from './chat.ts'
import { RequestError, assert, text } from './rules.ts'
export { RequestError } from './rules.ts'
export type Profile = {
  id: string
  alias: string
  groupId: string | null
  hasCreatedGroup: boolean
  onboarded: boolean
  welcomeGroupId: string | null
  joinAttempts: number[]
  deleting?: boolean
  email?: string
  displayName?: string
  authSynced?: boolean
  composeAttempts?: number[]
}
export type Family = { id: string; name: string; ownerId: string; code: string; disbandedAt?: number }
export type Wish = { id: string; ownerId: string; title: string; note: string; date: string; category: string; done: boolean }
export type Store = { revision: number; profiles: Record<string, Profile>; families: Record<string, Family>; wishes: Record<string, Wish>; threads?: Record<string, Thread>; schemaVersion?: number }
export type Workspace = {
  profile: Omit<Profile, 'joinAttempts' | 'deleting' | 'composeAttempts'>
  family: Family | null
  members: { id: string; alias: string }[]
  wishes: (Wish & { person: string })[]
}
export const categories = ['Adventure', 'Food & fun', 'Travel', 'Little joys']
export const emptyStore = (): Store => ({ revision: 0, profiles: {}, families: {}, wishes: {} })

export function ensureProfile(store: Store, id: string) {
  store.profiles[id] ??= { id, alias: 'Memory maker', groupId: null, hasCreatedGroup: false, onboarded: false, welcomeGroupId: null, joinAttempts: [] }
  return store.profiles[id]
}
export function workspace(store: Store, id: string): Workspace {
  const profile = store.profiles[id]
  assert(profile && !profile.deleting, 'Your account is unavailable. Please sign in again.', 403)
  const group = profile.groupId ? store.families[profile.groupId] : null
  const family = group && !group.disbandedAt ? group : null
  const members = Object.values(store.profiles).filter(p => !p.deleting && (family ? p.groupId === family.id : p.id === id)).map(p => ({ id: p.id, alias: baseName(p) }))
  const ids = new Set(members.map(m => m.id))
  const { joinAttempts: _attempts, deleting: _deleting, composeAttempts: _compose, ...safeProfile } = profile
  return {
    profile: { ...safeProfile, alias: baseName(profile) }, family, members,
    wishes: Object.values(store.wishes).filter(w => ids.has(w.ownerId)).map(w => ({ ...w, person: baseName(store.profiles[w.ownerId]) })).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  }
}
function leaveFamily(store: Store, profile: Profile, now: number) {
  const group = profile.groupId ? store.families[profile.groupId] : null
  if (group?.ownerId === profile.id) {
    const thread = ensureFamilyThread(store, group, now)
    for (const p of Object.values(store.profiles)) {
      if (p.groupId === group.id) { closeSeat(thread, p.id, now, 'disbanded'); p.groupId = null; p.welcomeGroupId = null }
    }
    group.disbandedAt = now
  } else if (group) {
    closeSeat(ensureFamilyThread(store, group, now), profile.id, now)
  }
  profile.groupId = null
  profile.welcomeGroupId = null
}
export function removeAccountData(store: Store, id: string, now = Date.now()) {
  const p = store.profiles[id]
  if (p) leaveFamily(store, p, now)
  for (const thread of Object.values(store.threads ?? {})) {
    thread.messages = thread.messages.filter(m => m.senderId !== id)
    delete thread.aliases[id]
  }
  for (const [key, wish] of Object.entries(store.wishes)) if (wish.ownerId === id) delete store.wishes[key]
  delete store.profiles[id]
}

// All mutations run inside the server's atomic compare-and-swap retry loop.
export function applyAction(store: Store, id: string, action: Record<string, unknown>, entropy: { id: string; code: string; now: number }): { error?: string } {
  upgradeChat(store, entropy.now)
  const p = ensureProfile(store, id)
  assert(!p.deleting, 'Account deletion is in progress.', 403)
  switch (action.type) {
    case 'onboarding.skip':
      p.onboarded = true
      break
    case 'profile.alias':
      p.displayName = text(action.alias, 40, 'Your display name', true)
      p.alias = p.displayName || p.email || 'Memory maker'
      break
    case 'welcome.dismiss':
      p.welcomeGroupId = null
      break
    case 'family.create': {
      assert(!p.groupId, 'Leave your current family before creating another.')
      assert(!p.hasCreatedGroup, 'One family creation per account. You can still join a family with its code.')
      const name = text(action.name, 60, 'Your family name')
      assert(!Object.values(store.families).some(f => f.code === entropy.code), 'Please try again. That code is already taken.', 409)
      store.families[entropy.id] = { id: entropy.id, name, ownerId: id, code: entropy.code }
      p.groupId = entropy.id
      p.hasCreatedGroup = true
      p.onboarded = true
      p.welcomeGroupId = entropy.id
      ensureFamilyThread(store, store.families[entropy.id], entropy.now)
      break
    }
    case 'family.join': {
      assert(!p.groupId, 'Leave your current family—or disband the one you created—before joining another.')
      const code = text(action.code, 32, 'The invitation code').replace(/[\s-]/g, '').toUpperCase()
      p.joinAttempts = p.joinAttempts.filter(t => t > entropy.now - 10 * 60 * 1000)
      if (p.joinAttempts.length >= 8) return { error: 'Too many secret handshakes. Wait ten minutes before trying again.' }
      p.joinAttempts.push(entropy.now)
      const family = Object.values(store.families).find(f => f.code === code && !f.disbandedAt && !store.profiles[f.ownerId]?.deleting)
      if (!family) return { error: 'That code didn’t open a door. Check it with your family and try again.' }
      const thread = ensureFamilyThread(store, family, entropy.now)
      const oldSeat = thread.members[id]
      if (oldSeat?.rejoinAt && entropy.now < oldSeat.rejoinAt) return { error: cooldownMessage(oldSeat.rejoinAt, entropy.now) }
      p.groupId = family.id
      p.onboarded = true
      p.welcomeGroupId = family.id
      p.joinAttempts = []
      addSeat(thread, id, entropy.now)
      break
    }
    case 'family.leave':
      assert(p.groupId, 'You’re already flying solo.')
      assert(store.families[p.groupId]?.ownerId !== id, 'You’re the keeper of this crew. Disband your family before joining another.')
      leaveFamily(store, p, entropy.now)
      break
    case 'family.disband':
      assert(p.groupId && store.families[p.groupId]?.ownerId === id, 'Only the creator can close this family’s chapter.', 403)
      leaveFamily(store, p, entropy.now)
      break
    case 'family.kick': {
      const family = p.groupId ? store.families[p.groupId] : null
      assert(family?.ownerId === id, 'Only the family creator can remove members.', 403)
      const memberId = text(action.memberId, 100, 'The member ID')
      const member = store.profiles[memberId]
      assert(memberId !== id && member?.groupId === family!.id, 'Choose another member of your family.')
      closeSeat(ensureFamilyThread(store, family!, entropy.now), memberId, entropy.now, 'removed')
      member.groupId = null
      member.welcomeGroupId = null
      // A removed member cannot rejoin with the code they already know.
      family!.code = entropy.code
      break
    }
    case 'wish.save': {
      const wishId = action.id ? text(action.id, 100, 'The wish ID') : entropy.id
      const existing = store.wishes[wishId]
      assert(!action.id || existing?.ownerId === id, 'You can only edit your own wishes.', 403)
      const date = text(action.date, 10, 'The date')
      assert(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date, 'Choose a valid date.')
      assert(categories.includes(String(action.category)), 'Choose a category from the list.')
      store.wishes[wishId] = { id: wishId, ownerId: id, title: text(action.title, 90, 'The wish'), note: text(action.note ?? '', 300, 'The note', true), date, category: String(action.category), done: existing?.done ?? false }
      break
    }
    case 'wish.toggle':
    case 'wish.delete': {
      const wishId = text(action.id, 100, 'The wish ID')
      const wish = store.wishes[wishId]
      assert(wish?.ownerId === id, 'You can only change your own wishes.', 403)
      if (action.type === 'wish.delete') delete store.wishes[wishId]
      else { assert(typeof action.done === 'boolean', 'Choose a completion state.'); wish.done = action.done }
      break
    }
    default:
      throw new RequestError('That action isn’t on the list.', 400)
  }
  return {}
}
