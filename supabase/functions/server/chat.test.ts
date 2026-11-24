import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyAction, emptyStore, ensureProfile, removeAccountData } from './domain.ts'
import { applyChatAction, getThread, listThreads, startPrivate, baseName, REJOIN_WAIT_MS, EDIT_WINDOW_MS } from './chat.ts'

const now = 1700000000000
function setup() {
  const s = emptyStore()
  for (const id of ['alice', 'bob', 'cara', 'outsider']) {
    const p = ensureProfile(s, id); p.email = `${id}@example.test`; p.displayName = id.toUpperCase()
  }
  applyAction(s, 'alice', { type: 'family.create', name: 'The Pancake People' }, { id: 'crew', code: 'AABBCCDDEEFF', now })
  applyAction(s, 'bob', { type: 'family.join', code: 'AABBCCDDEEFF' }, { id: 'join', code: '', now: now + 1 })
  return s
}
type State = ReturnType<typeof setup>
const family = 'family:crew'
function send(s: State, who: string, body = 'Pancakes?', time = now + 1000, id = 'message-1', threadId = family) {
  applyChatAction(s, who, { type: 'message.send', threadId, body }, { id, now: time })
}
function edit(s: State, who: string, time: number, messageId = 'message-1', expectedVersion = 1, threadId = family) {
  applyChatAction(s, who, { type: 'message.edit', threadId, messageId, body: 'Definitely pancakes.', expectedVersion }, { id: 'edit', now: time })
}
function leave(s: State, who = 'bob', time = now + 10000) {
  applyAction(s, who, { type: 'family.leave' }, { id: 'leave', code: '', now: time })
}

test('family threads are created automatically; private chats are visible only to their two members', () => {
  const s = setup()
  assert.equal(listThreads(s, 'alice', now).length, 1)
  const dm = startPrivate(s, 'alice', 'bob', 'Private pancakes?', now + 1000, 'dm-1')
  assert.equal(getThread(s, dm, 'bob', now + 2000).messages[0].body, 'Private pancakes?')
  assert.throws(() => getThread(s, dm, 'outsider', now + 2000), /isn’t in your bucket/)
  assert.equal(listThreads(s, 'outsider', now).length, 0)
})
test('private threads are reused instead of creating duplicate conversations', () => {
  const s = setup()
  const first = startPrivate(s, 'alice', 'bob', 'Hello', now + 1000, 'dm-1')
  const second = startPrivate(s, 'bob', 'alice', 'Hey!', now + 2000, 'dm-2')
  assert.equal(first, second)
  assert.equal(getThread(s, first, 'alice', now + 3000).messages.length, 2)
})
test('senders of every role may edit their own unanswered messages inside the original window', () => {
  for (const sender of ['alice', 'bob']) {
    const s = setup(); send(s, sender)
    edit(s, sender, now + 2000)
    const message = getThread(s, family, sender, now + 3000).messages[0]
    assert.equal(message.body, 'Definitely pancakes.')
    assert.equal(message.edited, true)
    assert.equal(message.versions[0].body, 'Pancakes?')
    assert.equal(message.versions.length, 2)
  }
})
test('another person cannot edit a sender’s message, even the family creator', () => {
  const s = setup(); send(s, 'bob')
  assert.throws(() => edit(s, 'alice', now + 2000), /only polish your own/)
})
test('edits are rejected at the exact deadline and after it', () => {
  const s = setup(); send(s, 'bob')
  assert.equal(getThread(s, family, 'bob', now + 1000 + EDIT_WINDOW_MS - 1).messages[0].canEdit, true)
  assert.throws(() => edit(s, 'bob', now + 1000 + EDIT_WINDOW_MS), /2½ minutes/)
  assert.throws(() => edit(s, 'bob', now + 1000 + EDIT_WINDOW_MS + 1), /2½ minutes/)
})
test('a later reply locks an edit, including when an edit form was already opened', () => {
  const s = setup(); send(s, 'bob')
  assert.equal(getThread(s, family, 'bob', now + 1500).messages[0].canEdit, true)
  send(s, 'alice', 'Count me in!', now + 2000, 'reply')
  assert.equal(getThread(s, family, 'bob', now + 2500).messages[0].canEdit, false)
  assert.throws(() => edit(s, 'bob', now + 3000), /someone replied/)
})
test('the sender’s later messages are not treated as another person’s reply', () => {
  const s = setup(); send(s, 'bob')
  send(s, 'bob', 'With syrup.', now + 2000, 'followup')
  edit(s, 'bob', now + 3000)
  assert.equal(getThread(s, family, 'bob', now + 4000).messages[0].edited, true)
})
test('editing never extends the deadline and stale multi-tab saves are rejected', () => {
  const s = setup(); send(s, 'bob')
  edit(s, 'bob', now + 2000)
  assert.throws(() => edit(s, 'bob', now + 3000), /makeover elsewhere/)
  assert.throws(() => edit(s, 'bob', now + 1000 + EDIT_WINDOW_MS, 'message-1', 2), /2½ minutes/)
})
test('private chats enforce the same reply lock and edit deadline', () => {
  const s = setup()
  const dm = startPrivate(s, 'alice', 'bob', 'Hello', now + 1000, 'dm-1')
  edit(s, 'alice', now + 2000, 'dm-1', 1, dm)
  send(s, 'bob', 'Hi!', now + 3000, 'dm-2', dm)
  assert.throws(() => edit(s, 'alice', now + 4000, 'dm-1', 2, dm), /someone replied/)
})
test('leavers retain old messages, never receive future messages, and cannot send or edit', () => {
  const s = setup(); send(s, 'alice', 'Before leaving')
  leave(s)
  send(s, 'alice', 'After leaving', now + 11000, 'future')
  const archived = getThread(s, family, 'bob', now + 12000)
  assert.equal(archived.status, 'left')
  assert.deepEqual(archived.messages.map(m => m.body), ['Before leaving'])
  assert.equal(archived.canSend, false)
  assert.throws(() => send(s, 'bob', 'Sneaking back', now + 13000), /keepsake/)
  assert.throws(() => edit(s, 'bob', now + 13000), /keepsake/)
})
test('future message edits and their history are also hidden from former members', () => {
  const s = setup(); send(s, 'alice', 'Original message')
  leave(s, 'bob', now + 2000)
  edit(s, 'alice', now + 3000)
  const archived = getThread(s, family, 'bob', now + 4000).messages[0]
  assert.equal(archived.body, 'Original message')
  assert.equal(archived.edited, false)
  assert.equal(archived.versions.length, 1)
})
test('invite codes and the rejoin endpoint both enforce the full 45-day cooldown', () => {
  const s = setup(); leave(s)
  const early = now + 10000 + REJOIN_WAIT_MS - 1
  const result = applyAction(s, 'bob', { type: 'family.join', code: 'AABBCCDDEEFF' }, { id: 'x', code: '', now: early })
  assert.match(result.error ?? '', /1 day/)
  assert.throws(() => applyChatAction(s, 'bob', { type: 'family.rejoin', threadId: family }, { id: 'x', now: early }), /1 day/)
  assert.equal(getThread(s, family, 'bob', early).canRejoin, false)
  assert.equal(getThread(s, family, 'bob', early + 1).canRejoin, true)
})
test('family aliases are scoped to the family, persist across rejoin, and never change private display names', () => {
  const s = setup()
  applyChatAction(s, 'alice', { type: 'family.chat-alias', threadId: family, memberId: 'bob', alias: 'Chief Snack Officer' }, { id: 'alias', now })
  const dm = startPrivate(s, 'alice', 'bob', 'Hi', now + 1000, 'dm')
  assert.equal(getThread(s, family, 'alice', now).members.find(m => m.id === 'bob')?.name, 'Chief Snack Officer')
  assert.equal(getThread(s, dm, 'alice', now).title, 'BOB')
  leave(s)
  applyChatAction(s, 'bob', { type: 'family.rejoin', threadId: family }, { id: 'back', now: now + 10000 + REJOIN_WAIT_MS })
  assert.equal(getThread(s, family, 'bob', now + 10000 + REJOIN_WAIT_MS).members.find(m => m.id === 'bob')?.name, 'Chief Snack Officer')
})
test('only the family creator can assign family aliases', () => {
  const s = setup()
  assert.throws(() => applyChatAction(s, 'bob', { type: 'family.chat-alias', threadId: family, memberId: 'alice', alias: 'Nope' }, { id: 'alias', now }), /Only the family creator/)
})
test('returning after cooldown preserves history but not messages from the absence', () => {
  const s = setup(); send(s, 'alice', 'Before')
  leave(s)
  send(s, 'alice', 'While away', now + 20000, 'gap')
  const back = now + 10000 + REJOIN_WAIT_MS
  applyChatAction(s, 'bob', { type: 'family.rejoin', threadId: family }, { id: 'back', now: back })
  send(s, 'alice', 'Welcome back', back + 1000, 'new')
  assert.deepEqual(getThread(s, family, 'bob', back + 2000).messages.map(m => m.body), ['Before', 'Welcome back'])
})
test('kicked members cannot bypass their removal with the rejoin button', () => {
  const s = setup()
  applyAction(s, 'alice', { type: 'family.kick', memberId: 'bob' }, { id: 'kick', code: 'NEWCODE12345', now })
  assert.throws(() => applyChatAction(s, 'bob', { type: 'family.rejoin', threadId: family }, { id: 'back', now: now + REJOIN_WAIT_MS }), /fresh invite code/)
})
test('member avatars sort by last visible message then original join time', () => {
  const s = setup()
  applyAction(s, 'cara', { type: 'family.join', code: 'AABBCCDDEEFF' }, { id: 'join', code: '', now: now + 100 })
  assert.deepEqual(getThread(s, family, 'alice', now + 200).members.map(m => m.id), ['alice', 'bob', 'cara'])
  send(s, 'bob', 'Hi', now + 1000)
  send(s, 'cara', 'Hello', now + 2000, 'second')
  assert.deepEqual(getThread(s, family, 'alice', now + 3000).members.map(m => m.id), ['cara', 'bob', 'alice'])
})
test('former members do not see new member identities or activity arriving after their exit', () => {
  const s = setup(); leave(s)
  applyAction(s, 'cara', { type: 'family.join', code: 'AABBCCDDEEFF' }, { id: 'join', code: '', now: now + 20000 })
  send(s, 'cara', 'New arrival', now + 21000)
  assert.equal(getThread(s, family, 'bob', now + 22000).members.some(m => m.id === 'cara'), false)
  assert.equal(getThread(s, family, 'bob', now + 22000).lastMessage, null)
})
test('disbanding retains read-only threads for all members and cannot be rejoined', () => {
  const s = setup(); send(s, 'bob')
  applyAction(s, 'alice', { type: 'family.disband' }, { id: 'close', code: '', now: now + 2000 })
  for (const who of ['alice', 'bob']) {
    const view = getThread(s, family, who, now + REJOIN_WAIT_MS)
    assert.equal(view.status, 'disbanded')
    assert.equal(view.messages.length, 1)
    assert.equal(view.canRejoin, false)
    assert.throws(() => send(s, who, 'No', now + REJOIN_WAIT_MS), /keepsake/)
  }
})
test('a member must leave, and a creator must disband, before joining another family', () => {
  const s = setup()
  applyAction(s, 'cara', { type: 'family.create', name: 'Another crew' }, { id: 'other', code: 'OTHER1234567', now })
  for (const who of ['alice', 'bob']) assert.throws(() => applyAction(s, who, { type: 'family.join', code: 'OTHER1234567' }, { id: 'join', code: '', now }), /Leave your current family/)
  assert.throws(() => leave(s, 'alice'), /Disband/)
})
test('email is the fallback, display name overrides it, and clearing the name restores email', () => {
  const s = setup()
  assert.equal(baseName({ ...s.profiles.bob, displayName: '' }), 'bob@example.test')
  assert.equal(baseName(s.profiles.bob), 'BOB')
  applyAction(s, 'bob', { type: 'profile.alias', alias: '' }, { id: 'clear', code: '', now })
  assert.equal(baseName(s.profiles.bob), 'bob@example.test')
})
test('no thread deletion action exists, including for left-family keepsakes', () => {
  const s = setup(); leave(s)
  assert.throws(() => applyChatAction(s, 'bob', { type: 'thread.delete', threadId: family }, { id: 'delete', now }), /keepsake/)
  assert.ok(s.threads?.[family])
})
test('account deletion removes the account’s messages and aliases but preserves others’ chat history', () => {
  const s = setup(); send(s, 'bob'); send(s, 'alice', 'Hello', now + 2000, 'alice-message')
  removeAccountData(s, 'bob', now + 3000)
  const history = getThread(s, family, 'alice', now + 4000)
  assert.deepEqual(history.messages.map(m => m.senderId), ['alice'])
})
test('deleting a responder’s account never reopens the sender’s edit permission', () => {
  const s = setup(); send(s, 'alice'); send(s, 'bob', 'Reply', now + 2000, 'reply')
  removeAccountData(s, 'bob', now + 3000)
  assert.throws(() => edit(s, 'alice', now + 4000), /someone replied/)
})
test('avatar ordering uses send sequence when two people message in the same millisecond', () => {
  const s = setup()
  send(s, 'alice', 'First', now + 1000, 'first')
  send(s, 'bob', 'Second', now + 1000, 'second')
  assert.equal(getThread(s, family, 'alice', now + 2000).members[0].id, 'bob')
})
test('crafted object-property names cannot masquerade as conversations or family members', () => {
  const s = setup()
  assert.throws(() => getThread(s, '__proto__', 'alice', now), /isn’t in your bucket/)
  assert.throws(() => applyChatAction(s, 'alice', { type: 'family.chat-alias', threadId: family, memberId: 'constructor', alias: 'Nope' }, { id: 'x', now }), /Choose someone/)
})
