import type { Store, Profile, Family } from './domain.ts'
import { assert, text } from './rules.ts'

export const EDIT_WINDOW_MS = 150000
export const REJOIN_WAIT_MS = 45 * 24 * 60 * 60 * 1000
export type Revision = { body: string; at: number; sequence: number }
export type Message = { id: string; senderId: string; sentAt: number; sequence: number; versions: Revision[]; answeredAt?: number }
export type Seat = { joinedAt: number; windows: { start: number; end?: number }[]; leftAt?: number; rejoinAt?: number; reason?: 'left' | 'removed' | 'disbanded' }
export type Thread = { id: string; kind: 'private' | 'family'; familyId?: string; title: string; createdAt: number; sequence: number; members: Record<string, Seat>; aliases: Record<string, string>; messages: Message[] }
export type ChatMember = { id: string; name: string; baseName: string; joinedAt: number; active: boolean; lastMessageAt: number; lastMessageSequence: number }
export type MessageView = { id: string; senderId: string; sender: string; body: string; sentAt: number; edited: boolean; versions: Revision[]; canEdit: boolean; editUntil: number }
export type ThreadSummary = {
  id: string; kind: 'private' | 'family'; title: string; status: 'private' | 'active' | 'left' | 'disbanded'
  members: ChatMember[]; lastMessage: { body: string; sender: string; at: number } | null
  createdAt: number; canSend: boolean; canManageAliases: boolean; rejoinAt: number | null; canRejoin: boolean; rejoinNote: string | null
}
export type ThreadView = ThreadSummary & { messages: MessageView[]; serverNow: number }

export function baseName(p: Profile | undefined) {
  if (!p || p.deleting) return 'Former memory maker'
  return p.displayName?.trim() || p.email || (p.alias !== 'Memory maker' ? p.alias : '') || 'Memory maker'
}
export function chatName(store: Store, thread: Thread, id: string) {
  return store.profiles[id]?.deleting || !store.profiles[id] ? 'Former memory maker' : (thread.kind === 'family' && thread.aliases[id]) || baseName(store.profiles[id])
}
export function addSeat(thread: Thread, id: string, now: number) {
  const previous = thread.members[id]
  if (previous && previous.windows.at(-1)?.end === undefined) return
  thread.members[id] = { joinedAt: previous?.joinedAt ?? now, windows: [...(previous?.windows ?? []), { start: ++thread.sequence }] }
}
export function ensureFamilyThread(store: Store, family: Family, now: number) {
  store.threads ??= {}
  const id = `family:${family.id}`
  if (!store.threads[id]) {
    const t: Thread = { id, kind: 'family', familyId: family.id, title: family.name, createdAt: now, sequence: 0, members: {}, aliases: {}, messages: [] }
    store.threads[id] = t
    for (const p of Object.values(store.profiles)) if (p.groupId === family.id && !p.deleting) addSeat(t, p.id, now)
  }
  return store.threads[id]
}
export function upgradeChat(store: Store, now: number) {
  store.threads ??= {}
  for (const family of Object.values(store.families)) if (!family.disbandedAt) ensureFamilyThread(store, family, now)
  store.schemaVersion = 2
}
export function closeSeat(thread: Thread, id: string, now: number, reason: Seat['reason'] = 'left') {
  const seat = thread.members[id]
  if (!seat) return
  const window = seat.windows.at(-1)
  if (window && window.end === undefined) window.end = thread.sequence
  seat.leftAt = now
  seat.rejoinAt = now + REJOIN_WAIT_MS
  seat.reason = reason
  ++thread.sequence
}
export function cooldownMessage(until: number, now: number) {
  const days = Math.max(1, Math.ceil((until - now) / 86400000))
  return `Even great comebacks need an intermission. Your seat opens in ${days} ${days === 1 ? 'day' : 'days'}.`
}
function currentMember(store: Store, thread: Thread, id: string) {
  if (store.profiles[id]?.deleting || !store.profiles[id]) return false
  if (thread.kind === 'private') return Boolean(thread.members[id])
  const family = thread.familyId ? store.families[thread.familyId] : undefined
  return Boolean(family && !family.disbandedAt && store.profiles[id]?.groupId === family.id && thread.members[id]?.windows.at(-1)?.end === undefined)
}
function canEdit(store: Store, thread: Thread, message: Message, id: string, now: number) {
  return message.senderId === id && message.answeredAt === undefined && currentMember(store, thread, id) && now >= message.sentAt && now < message.sentAt + EDIT_WINDOW_MS
    && !thread.messages.some(m => m.sequence > message.sequence && m.senderId !== id)
}
function readableMessages(thread: Thread, id: string) {
  const seat = thread.members[id]
  assert(seat, 'This conversation isn’t in your bucket.', 403)
  return thread.messages.flatMap(m => {
    const window = seat.windows.find(w => m.sequence >= w.start && (w.end === undefined || m.sequence <= w.end))
    if (!window) return []
    const versions = m.versions.filter(v => window.end === undefined || v.sequence <= window.end)
    if (!versions.length) return []
    return [{ message: m, versions }]
  })
}
export function getThread(store: Store, threadId: string, id: string, now: number): ThreadView {
  const thread = store.threads?.[threadId]
  assert(thread?.members && Object.prototype.hasOwnProperty.call(thread.members, id) && !store.profiles[id]?.deleting && store.profiles[id], 'This conversation isn’t in your bucket.', 403)
  const seat = thread.members[id]
  const active = currentMember(store, thread, id)
  const family = thread.familyId ? store.families[thread.familyId] : undefined
  const status = thread.kind === 'private' ? 'private' : family?.disbandedAt ? 'disbanded' : active ? 'active' : 'left'
  const visible = readableMessages(thread, id)
  const cutoff = active ? Infinity : seat.windows.at(-1)?.end ?? 0
  const messages = visible.map(({ message: m, versions }) => ({
    id: m.id, senderId: m.senderId, sender: chatName(store, thread, m.senderId), body: versions.at(-1)!.body,
    sentAt: m.sentAt, edited: versions.length > 1, versions, canEdit: canEdit(store, thread, m, id, now), editUntil: m.sentAt + EDIT_WINDOW_MS,
  }))
  const members: ChatMember[] = Object.entries(thread.members)
    .filter(([, s]) => s.windows.some(w => w.start <= cutoff))
    .map(([memberId, s]) => ({
      id: memberId, name: chatName(store, thread, memberId), baseName: baseName(store.profiles[memberId]), joinedAt: s.joinedAt,
      active: active ? currentMember(store, thread, memberId) : s.windows.some(w => w.start <= cutoff && (w.end === undefined || w.end >= cutoff)),
      lastMessageAt: Math.max(0, ...messages.filter(m => m.senderId === memberId).map(m => m.sentAt)),
      lastMessageSequence: Math.max(0, ...visible.filter(m => m.message.senderId === memberId).map(m => m.message.sequence)),
    })).sort((a, b) => b.lastMessageAt - a.lastMessageAt || b.lastMessageSequence - a.lastMessageSequence || a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))
  const last = messages.at(-1)
  const otherId = Object.keys(thread.members).find(memberId => memberId !== id)
  const currentFamily = store.profiles[id]?.groupId
  const canRejoin = status === 'left' && !family?.disbandedAt && Boolean(family) && !currentFamily && seat.reason === 'left' && now >= (seat.rejoinAt ?? Infinity)
  const rejoinNote = status === 'disbanded' ? 'This family closed its chapter. The stories stay; the send button retires.'
    : status !== 'left' ? null
    : (seat.rejoinAt ?? Infinity) > now ? cooldownMessage(seat.rejoinAt!, now)
    : seat.reason === 'removed' ? 'Your intermission is over. Ask the creator for a fresh invite code to return.'
    : currentFamily ? 'Your comeback is ready. Leave your current family—or disband the one you created—first.'
    : 'Your seat’s warm again. Ready for a little family reunion?'
  return {
    id: thread.id, kind: thread.kind, title: thread.kind === 'private' ? baseName(store.profiles[otherId ?? '']) : thread.title,
    status, members, messages, serverNow: now, createdAt: thread.createdAt,
    lastMessage: last ? { body: last.body, sender: last.sender, at: last.sentAt } : null,
    canSend: active && (thread.kind === 'family' || Boolean(otherId && store.profiles[otherId] && !store.profiles[otherId].deleting)),
    canManageAliases: Boolean(active && family?.ownerId === id), rejoinAt: seat.rejoinAt ?? null, canRejoin, rejoinNote,
  }
}
export function listThreads(store: Store, id: string, now: number): ThreadSummary[] {
  return Object.values(store.threads ?? {}).filter(t => t.members[id]).map(t => {
    const { messages: _messages, serverNow: _now, ...summary } = getThread(store, t.id, id, now)
    return summary
  }).sort((a, b) => (b.lastMessage?.at ?? b.createdAt) - (a.lastMessage?.at ?? a.createdAt) || a.id.localeCompare(b.id))
}
export function startPrivate(store: Store, id: string, recipientId: string, body: string, now: number, messageId: string) {
  assert(id !== recipientId, 'Talking to yourself? That’s what the bucket list is for.')
  assert(store.profiles[recipientId] && !store.profiles[recipientId].deleting, 'We couldn’t start that chat. Check the email or ask them to sign in first.')
  store.threads ??= {}
  const threadId = `private:${[id, recipientId].sort().join(':')}`
  if (!store.threads[threadId]) {
    const thread: Thread = { id: threadId, kind: 'private', title: '', createdAt: now, sequence: 0, members: {}, aliases: {}, messages: [] }
    addSeat(thread, id, now); addSeat(thread, recipientId, now)
    store.threads[threadId] = thread
  }
  applyChatAction(store, id, { type: 'message.send', threadId, body }, { now, id: messageId })
  return threadId
}
export function applyChatAction(store: Store, id: string, action: Record<string, unknown>, event: { now: number; id: string }) {
  const threadId = text(action.threadId, 240, 'The conversation')
  const thread = store.threads?.[threadId]
  assert(thread?.members && Object.prototype.hasOwnProperty.call(thread.members, id) && store.profiles[id] && !store.profiles[id].deleting, 'This conversation isn’t in your bucket.', 403)
  const p = store.profiles[id]
  if (action.type === 'family.rejoin') {
    const family = thread.familyId ? store.families[thread.familyId] : null
    assert(family && !family.disbandedAt, 'This family has closed its chapter.')
    assert(!p.groupId, 'Leave your current family—or disband the one you created—before rejoining.')
    const seat = thread.members[id]
    assert(seat.reason === 'left', 'Ask the family creator for a fresh invite code.')
    assert(event.now >= (seat.rejoinAt ?? Infinity), cooldownMessage(seat.rejoinAt ?? Infinity, event.now))
    p.groupId = family.id; p.welcomeGroupId = family.id; p.onboarded = true
    addSeat(thread, id, event.now)
    return
  }
  assert(currentMember(store, thread, id), 'This chat is a keepsake now. No new messages from the sidelines.', 403)
  if (action.type === 'family.chat-alias') {
    const family = thread.familyId ? store.families[thread.familyId] : null
    assert(thread.kind === 'family' && family?.ownerId === id, 'Only the family creator can give the crew nicknames.', 403)
    const memberId = text(action.memberId, 100, 'The member')
    assert(Object.prototype.hasOwnProperty.call(thread.members, memberId) && Object.prototype.hasOwnProperty.call(store.profiles, memberId) && !store.profiles[memberId].deleting, 'Choose someone from this family’s story.')
    const alias = text(action.alias, 40, 'The nickname', true)
    if (alias) thread.aliases[memberId] = alias
    else delete thread.aliases[memberId]
    return
  }
  const body = text(action.body, 2000, 'Your message')
  if (action.type === 'message.send') {
    assert(getThread(store, threadId, id, event.now).canSend, 'This person has closed their bucket. The conversation stays as a keepsake.', 403)
    assert(!thread.messages.some(m => m.senderId === id && m.sentAt > event.now - 750), 'Let that thought land. Try again in a second.', 429)
    assert(thread.messages.length < 10000, 'This conversation’s bucket is full. Please contact support for more room.', 409)
    for (const previous of thread.messages) if (previous.senderId !== id) previous.answeredAt ??= event.now
    const sequence = ++thread.sequence
    thread.messages.push({ id: event.id, senderId: id, sentAt: event.now, sequence, versions: [{ body, at: event.now, sequence }] })
  } else if (action.type === 'message.edit') {
    const message = thread.messages.find(m => m.id === action.messageId)
    assert(message && message.senderId === id, 'You can only polish your own punchlines.', 403)
    assert(canEdit(store, thread, message, id, event.now), 'That thought has left the station: 2½ minutes passed, or someone replied. Send a follow-up instead.', 409)
    assert(action.expectedVersion === message.versions.length, 'This message already got a makeover elsewhere. Reopen it before editing.', 409)
    assert(message.versions.length < 30, 'That punchline’s had quite the makeover. Send a follow-up instead.', 409)
    if (message.versions.at(-1)!.body !== body) message.versions.push({ body, at: event.now, sequence: ++thread.sequence })
  } else assert(false, 'That chat action isn’t on the list.')
}
