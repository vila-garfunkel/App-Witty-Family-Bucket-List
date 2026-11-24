import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyAction, emptyStore, ensureProfile, removeAccountData, workspace, type Store } from './domain.ts'

const entropy = { id: 'family-a', code: 'AABBCCDDEEFF', now: 1000000 }
function setup() {
  const s = emptyStore()
  for (const id of ['alice', 'bob', 'outsider']) ensureProfile(s, id)
  return s
}
function create(s: Store) { applyAction(s, 'alice', { type: 'family.create', name: 'The Pancake People' }, entropy) }
function join(s: Store) { return applyAction(s, 'bob', { type: 'family.join', code: 'aabbcc-ddeeff' }, entropy) }
function wish(s: Store, ownerId: string) {
  applyAction(s, ownerId, { type: 'wish.save', title: `${ownerId}’s adventure`, note: '', date: '2026-08-20', category: 'Adventure' }, { ...entropy, id: `wish-${ownerId}` })
}

test('new profiles start without a group; skipping is persisted without creating one', () => {
  const s = setup()
  assert.equal(s.profiles.alice.groupId, null)
  applyAction(s, 'alice', { type: 'onboarding.skip' }, entropy)
  assert.equal(s.profiles.alice.onboarded, true)
  assert.equal(s.profiles.alice.groupId, null)
  assert.deepEqual(s.families, {})
})
test('personal views contain only the account owner’s wishes', () => {
  const s = setup()
  wish(s, 'alice'); wish(s, 'bob')
  assert.deepEqual(workspace(s, 'alice').wishes.map(w => w.ownerId), ['alice'])
})
test('creation generates a family, creator membership, and a persistent welcome notification', () => {
  const s = setup(); create(s)
  const view = workspace(s, 'alice')
  assert.equal(view.family?.name, 'The Pancake People')
  assert.equal(view.family?.ownerId, 'alice')
  assert.equal(view.profile.welcomeGroupId, 'family-a')
  assert.equal(view.profile.onboarded, true)
})
test('a normalized invite code joins the family and shares only current members’ wishes', () => {
  const s = setup(); create(s)
  wish(s, 'alice'); wish(s, 'bob'); wish(s, 'outsider')
  assert.deepEqual(join(s), {})
  assert.deepEqual(workspace(s, 'bob').wishes.map(w => w.ownerId).sort(), ['alice', 'bob'])
  assert.equal(s.profiles.bob.welcomeGroupId, 'family-a')
  assert.equal(workspace(s, 'outsider').family, null)
})
test('a user cannot create a second family or join two simultaneously', () => {
  const s = setup(); create(s); join(s)
  assert.throws(() => applyAction(s, 'bob', { type: 'family.create', name: 'Second' }, entropy))
  assert.throws(() => join(s))
  applyAction(s, 'alice', { type: 'family.leave' }, entropy)
  assert.throws(() => create(s), /One family creation/)
})
test('leaving preserves personal wishes and removes access to other members’ wishes', () => {
  const s = setup(); create(s); join(s); wish(s, 'alice'); wish(s, 'bob')
  applyAction(s, 'bob', { type: 'family.leave' }, entropy)
  assert.deepEqual(workspace(s, 'bob').wishes.map(w => w.ownerId), ['bob'])
  assert.deepEqual(workspace(s, 'alice').wishes.map(w => w.ownerId), ['alice'])
})
test('only the creator can kick; kicking rotates the invite code and preserves wishes', () => {
  const s = setup(); create(s); join(s); wish(s, 'bob')
  assert.throws(() => applyAction(s, 'bob', { type: 'family.kick', memberId: 'alice' }, entropy), /Only the family creator/)
  applyAction(s, 'alice', { type: 'family.kick', memberId: 'bob' }, { ...entropy, code: 'FFEEDDCCBBAA' })
  assert.equal(s.profiles.bob.groupId, null)
  assert.equal(s.families['family-a'].code, 'FFEEDDCCBBAA')
  assert.equal(workspace(s, 'bob').wishes.length, 1)
  assert.ok(join(s).error)
})
test('a creator cannot kick themselves', () => {
  const s = setup(); create(s)
  assert.throws(() => applyAction(s, 'alice', { type: 'family.kick', memberId: 'alice' }, entropy))
})
test('creator leaving disbands the family for everyone without deleting their wishes', () => {
  const s = setup(); create(s); join(s); wish(s, 'alice'); wish(s, 'bob')
  applyAction(s, 'alice', { type: 'family.leave' }, entropy)
  assert.equal(Object.keys(s.families).length, 0)
  assert.equal(s.profiles.bob.groupId, null)
  assert.equal(s.profiles.alice.hasCreatedGroup, true)
  assert.equal(Object.keys(s.wishes).length, 2)
})
test('shared visibility never grants editing, deleting, or completing someone else’s wish', () => {
  const s = setup(); create(s); join(s); wish(s, 'alice')
  for (const type of ['wish.save', 'wish.delete', 'wish.toggle']) {
    assert.throws(() => applyAction(s, 'bob', { type, id: 'wish-alice', done: true }, entropy), /only/)
  }
})
test('aliases update attribution without exposing emails or join attempts', () => {
  const s = setup(); wish(s, 'alice')
  applyAction(s, 'alice', { type: 'profile.alias', alias: 'Captain Pancake' }, entropy)
  const view = workspace(s, 'alice')
  assert.equal(view.wishes[0].person, 'Captain Pancake')
  assert.equal('joinAttempts' in view.profile, false)
  assert.equal('email' in view.members[0], false)
})
test('welcome dismissal persists', () => {
  const s = setup(); create(s)
  applyAction(s, 'alice', { type: 'welcome.dismiss' }, entropy)
  assert.equal(workspace(s, 'alice').profile.welcomeGroupId, null)
})
test('invalid invite attempts are limited and recover after ten minutes', () => {
  const s = setup()
  for (let i = 0; i < 8; i++) assert.ok(applyAction(s, 'bob', { type: 'family.join', code: 'wrong' }, entropy).error)
  create(s)
  assert.match(join(s).error ?? '', /ten minutes/)
  assert.deepEqual(applyAction(s, 'bob', { type: 'family.join', code: entropy.code }, { ...entropy, now: entropy.now + 600001 }), {})
})
test('account data deletion removes owned wishes and disbands owned families but preserves other users', () => {
  const s = setup(); create(s); join(s); wish(s, 'alice'); wish(s, 'bob')
  removeAccountData(s, 'alice')
  assert.equal(s.profiles.alice, undefined)
  assert.equal(s.wishes['wish-alice'], undefined)
  assert.equal(s.profiles.bob.groupId, null)
  assert.ok(s.wishes['wish-bob'])
})
test('deleting and removed accounts cannot read or mutate app data', () => {
  const s = setup(); s.profiles.alice.deleting = true
  assert.throws(() => workspace(s, 'alice'))
  assert.throws(() => applyAction(s, 'alice', { type: 'onboarding.skip' }, entropy))
})
test('input validation rejects blank aliases, malformed dates, and unknown categories', () => {
  const s = setup()
  assert.throws(() => applyAction(s, 'alice', { type: 'profile.alias', alias: '  ' }, entropy))
  assert.throws(() => applyAction(s, 'alice', { type: 'wish.save', title: 'Test', date: '2026-02-31', category: 'Adventure' }, entropy), /valid date/)
  assert.throws(() => applyAction(s, 'alice', { type: 'wish.save', title: 'Test', date: '2026-02-21', category: 'Anything' }, entropy), /category/)
})
