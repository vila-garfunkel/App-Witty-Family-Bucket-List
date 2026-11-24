import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from './ui'
import { request } from './lib/workspace'
import type { ChatMember, MessageView, ThreadSummary, ThreadView } from '../supabase/functions/server/chat'
import './messages.css'

export function SageAvatar({ name, small = false }: { name: string; small?: boolean }) {
  const initials = name.includes('@') ? name.slice(0, 1) : name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('')
  return <span className={`avatar sage chat-avatar ${small ? 'chat-avatar-small' : ''}`} title={name} aria-label={name}>{initials.toUpperCase() || '?'}</span>
}
function Faces({ members }: { members: ChatMember[] }) {
  const present = members.filter(m => m.active)
  return <span className="chat-faces">{present.slice(0, 4).map(m => <SageAvatar small key={m.id} name={m.name} />)}{present.length > 4 && <span className="avatar sage chat-more" title={`${present.length - 4} more members`}>…</span>}</span>
}
function ThreadSymbol({ thread }: { thread: ThreadSummary }) {
  return thread.kind === 'family' ? <span className="choice-symbol sage"><Icon name="people" size={22} /></span> : <SageAvatar name={thread.title} />
}
const formatTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const formatDate = (at: number) => new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' })

export default function Messages({ userId, onMembershipChange }: { userId: string; onMembershipChange: () => void }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [selected, setSelected] = useState<string | null>(new URLSearchParams(window.location.search).get('thread'))
  const [thread, setThread] = useState<ThreadView | null>(null)
  const [loading, setLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('All chats')
  const [search, setSearch] = useState('')
  const [compose, setCompose] = useState(false)
  const [email, setEmail] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<MessageView | null>(null)
  const [editBody, setEditBody] = useState('')
  const [history, setHistory] = useState<MessageView | null>(null)
  const [aliases, setAliases] = useState(false)
  const [aliasMember, setAliasMember] = useState('')
  const [aliasValue, setAliasValue] = useState('')
  const [clock, setClock] = useState(Date.now())
  const offset = useRef(0)
  const selectedRef = useRef(selected)
  const seq = useRef(0)
  const active = useRef(true)
  const busyRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  selectedRef.current = selected
  const now = clock + offset.current

  function accept(next: ThreadView) {
    offset.current = next.serverNow - Date.now()
    setClock(Date.now())
    setThread(next)
    setThreads(current => {
      const summary = { ...next }
      return [summary, ...current.filter(t => t.id !== next.id)].sort((a, b) => (b.lastMessage?.at ?? b.createdAt) - (a.lastMessage?.at ?? a.createdAt))
    })
  }
  async function refresh() {
    if (busyRef.current) return
    const generation = ++seq.current
    const id = selectedRef.current
    try {
      const [list, detail] = await Promise.all([
        request<{ threads: ThreadSummary[]; serverNow: number }>('/messages'),
        id ? request<ThreadView>(`/messages/${encodeURIComponent(id)}`) : Promise.resolve(null),
      ])
      if (!active.current || generation !== seq.current || selectedRef.current !== id) return
      offset.current = list.serverNow - Date.now()
      setThreads(list.threads)
      if (detail) setThread(detail)
      setLoading(false); setThreadLoading(false)
    } catch (e) {
      if (active.current && generation === seq.current) {
        setError(e instanceof Error ? e.message : 'The conversation took a tiny detour.')
        setLoading(false); setThreadLoading(false)
      }
    }
  }
  useEffect(() => {
    active.current = true
    void refresh()
    const poll = window.setInterval(() => { if (!document.hidden) void refresh() }, 5000)
    const tick = window.setInterval(() => setClock(Date.now()), 1000)
    const focus = () => { void refresh() }
    const pop = () => { const id = new URLSearchParams(window.location.search).get('thread'); setSelected(id); setThread(null); setDraft(''); setEditing(null); setCompose(false) }
    window.addEventListener('focus', focus)
    window.addEventListener('popstate', pop)
    return () => { active.current = false; ++seq.current; window.clearInterval(poll); window.clearInterval(tick); window.removeEventListener('focus', focus); window.removeEventListener('popstate', pop) }
  }, [])
  useEffect(() => { if (selected) { setThreadLoading(true); void refresh() } }, [selected])
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight }, [thread?.id, thread?.messages.length])
  function open(id: string | null) {
    ++seq.current
    selectedRef.current = id
    setSelected(id); setThread(null); setDraft(''); setEditing(null); setHistory(null); setError(''); setCompose(false); setAliases(false)
    window.history.pushState(null, '', `/messages${id ? `?thread=${encodeURIComponent(id)}` : ''}`)
  }
  async function mutate(action: Record<string, unknown>) {
    if (busyRef.current || !selectedRef.current) return false
    busyRef.current = true; setBusy(true); setError(''); ++seq.current
    const id = selectedRef.current
    try {
      const next = await request<ThreadView>('/messages/action', { ...action, threadId: id })
      if (active.current && selectedRef.current === id) accept(next)
      return true
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : 'That thought didn’t quite land. Try again.')
      return false
    } finally {
      busyRef.current = false
      if (active.current) { setBusy(false); void refresh() }
    }
  }
  async function start(e: FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); ++seq.current
    try {
      const next = await request<ThreadView>('/messages/start', { email: email.trim(), body: firstMessage })
      if (active.current) { open(next.id); accept(next); setEmail(''); setFirstMessage(''); setThreadLoading(false) }
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'We couldn’t find that conversation starter.') }
    finally { busyRef.current = false; if (active.current) { setBusy(false); void refresh() } }
  }
  const visible = threads.filter(t => (filter === 'All chats' || filter === 'Private' && t.kind === 'private' || filter === 'Family' && t.status === 'active' || filter === 'Keepsakes' && ['left', 'disbanded'].includes(t.status)) && `${t.title} ${t.lastMessage?.body ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const archived = thread && ['left', 'disbanded'].includes(thread.status)
  const currentEdit = thread?.messages.find(m => m.id === editing?.id)
  const editAllowed = Boolean(currentEdit?.canEdit && now < currentEdit.editUntil && thread?.canSend)
  const historyMessage = history ? thread?.messages.find(m => m.id === history.id) ?? history : null
  const topError = error && <div className="workspace-error chat-error" role="alert"><span>{error}</span><button aria-label="Dismiss notification" onClick={() => setError('')}><Icon name="close" size={14} /></button></div>

  return <section className="messages-page">
    <div className="messages-heading"><div><span className="eyebrow">GOOD PLANS START WITH A LITTLE CHAT</span><h1>A little <span>back & forth.</span></h1><p>Private hellos, family plans, and the occasional very important snack debate.</p></div><span className="messages-heading-note">Less “we should catch up.”<br />More actually catching up.</span></div>
    <div className={`messenger ${selected || compose ? 'has-thread' : ''}`}>
      <aside className="inbox-panel" aria-label="Conversations">
        <div className="inbox-heading"><h2>Messages<span>{threads.length}</span></h2><button className="chat-compose-button" title="Start a private message" aria-label="Compose a new private message" onClick={() => { open(null); setCompose(true) }}><Icon name="edit" size={18} /></button></div>
        <div className="chat-search"><Icon name="search" size={16} /><input aria-label="Search your chats" placeholder="Find a person, plan, or punchline…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="inbox-tabs" role="tablist" aria-label="Conversation type">{['All chats', 'Private', 'Family', 'Keepsakes'].map(f => <button role="tab" aria-selected={filter === f} key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
        {error && !selected && !compose && topError}
        <div className="conversation-list">{loading ? <p className="chat-loading" role="status">Gathering your good company…</p> : visible.map(t => <button key={t.id} className={`conversation-row ${t.status} ${selected === t.id ? 'selected' : ''}`} onClick={() => open(t.id)}>
          <ThreadSymbol thread={t} /><div className="conversation-copy"><div className="conversation-title"><strong>{t.title}</strong><time>{t.lastMessage ? formatDate(t.lastMessage.at) : formatDate(t.createdAt)}</time></div><span className={`conversation-kind ${t.status}`}>{t.kind === 'private' ? 'JUST BETWEEN YOU TWO' : t.status === 'active' ? 'YOUR FAMILY' : t.status === 'disbanded' ? 'CLOSED CHAPTER · READ ONLY' : 'LEFT FAMILY · READ ONLY'}</span><p>{t.lastMessage ? `${t.kind === 'family' ? `${t.lastMessage.sender}: ` : ''}${t.lastMessage.body}` : t.status === 'active' ? 'Your people are here. Break the ice.' : 'A quiet little corner of your story.'}</p>{t.kind === 'family' && <div className="conversation-footer"><Faces members={t.members} /><span>{t.status === 'active' ? `${t.members.filter(m => m.active).length} in the crew` : 'Stories stay. Sending doesn’t.'}</span></div>}{t.rejoinNote && <p className={`chat-comeback-note ${t.canRejoin ? 'ready' : ''}`}>{t.canRejoin ? 'Your seat’s warm again. Come on back.' : t.rejoinNote}</p>}</div>
        </button>)}
        {!loading && !visible.length && <div className="chat-list-empty"><Icon name="message" size={25} /><h3>{threads.length ? 'No chats in this corner.' : 'Good conversations start somewhere.'}</h3><p>{threads.length ? 'Try another filter or a different search.' : 'Compose a private hello, or join a family to start planning together.'}</p><button className="text-button" onClick={() => { open(null); setCompose(true) }}>Say the first hello<Icon name="arrow" size={15} /></button></div>}</div>
        <div className="inbox-footnote"><Icon name="lock" size={12} />Private chats stay private. Keepsakes stay put.</div>
      </aside>

      <div className={`thread-panel ${archived ? 'archived-thread' : ''}`}>
        {compose ? <>
          <header className="thread-header"><button className="thread-back" aria-label="Back to messages" onClick={() => open(null)}><Icon name="back" /></button><span className="choice-symbol sage"><Icon name="edit" size={22} /></span><div><h2>A fresh little hello.</h2><p>One email. A whole conversation waiting to happen.</p></div></header>
          <form className="new-chat-form" onSubmit={start}><span className="eyebrow">JUST BETWEEN THE TWO OF YOU</span><h3>Who’s getting<br />the first <span>“hey, you”?</span></h3><label>Their email<input type="email" required maxLength={254} autoComplete="off" placeholder="your-favorite-human@example.com" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} /></label><label>Your icebreaker<textarea rows={4} required maxLength={2000} placeholder="So, I’ve had a very important idea…" value={firstMessage} disabled={busy} onChange={e => setFirstMessage(e.target.value)} /></label>{topError}<button className="primary-button" disabled={busy || !firstMessage.trim()}>{busy ? 'Delivering your hello…' : 'Let the conversation begin'}<Icon name="send" size={16} /></button><p>They’ll need a Family Bucket account. This is a private message, not a family invitation.</p></form>
        </> : !selected ? <div className="thread-welcome"><div className="thread-welcome-art"><Icon name="message" size={54} /><span className="little-reply"><Icon name="heart" size={24} /></span></div><span className="eyebrow">SOME OF THE BEST PLANS START WITH “HEY…”</span><h2>Big ideas.<br />Little chat bubbles.</h2><p>Pick a conversation, send a private hello, or round up the family for a very important discussion about dinner.</p><button className="primary-button" onClick={() => setCompose(true)}>Start a little conversation<Icon name="plus" size={17} /></button><span className="handwritten">Good company is only a message away.</span></div>
        : threadLoading || !thread ? <div className="chat-thread-loading" role="status"><Icon name="message" size={27} /><p>{threadLoading ? 'Finding your place in the conversation…' : 'We couldn’t open this conversation.'}</p>{topError}<button className="text-button" onClick={() => void refresh()}>Try again<Icon name="arrow" size={16} /></button><button className="text-button" onClick={() => open(null)}>Back to messages</button></div> : <>
          <header className="thread-header"><button className="thread-back" aria-label="Back to messages" onClick={() => open(null)}><Icon name="back" /></button><ThreadSymbol thread={thread} /><div><h2>{thread.title}</h2><p>{thread.kind === 'private' ? 'Just the two of you. Make it a good story.' : archived ? thread.status === 'disbanded' ? 'A closed chapter, safely kept.' : 'Your family keepsake. Read-only, never gone.' : `${thread.members.filter(m => m.active).length} memory makers · your family’s little planning room`}</p></div>{thread.kind === 'family' && <Faces members={thread.members} />}{thread.canManageAliases && <button className="alias-settings" title="Manage family chat nicknames" aria-label="Manage family chat nicknames" onClick={() => { setAliases(true); setAliasMember(''); setAliasValue('') }}><Icon name="people" size={18} /></button>}</header>
          <div className={`thread-privacy-note ${archived ? 'keepsake-note' : ''}`}><Icon name={archived ? 'clock' : 'lock'} size={12} />{archived ? 'A keepsake, not a live feed. Only messages from your time in the family appear here.' : thread.kind === 'family' ? 'The family room. Nicknames live here, not on profiles.' : 'No family audience. Just you, them, and your excellent ideas.'}</div>
          <div className="thread-messages" ref={scrollRef} aria-label="Message history">
            <span className="thread-start-note">{thread.messages.length ? 'A little chapter in your story' : 'The chat is quiet. Your next great plan doesn’t have to be.'}</span>
            {thread.messages.map((m, i) => <div key={m.id}>
              {(i === 0 || formatDate(m.sentAt) !== formatDate(thread.messages[i - 1].sentAt)) && <div className="message-date-divider"><span>{new Date(m.sentAt).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>}
              <article className={`message-row ${m.senderId === userId ? 'mine' : 'theirs'}`}><SageAvatar name={m.sender} small /><div className="message-stack"><span className="message-sender">{m.senderId === userId ? 'You' : m.sender}</span><div className="message-bubble">{m.body}</div><div className="message-meta"><time>{formatTime(m.sentAt)}</time>{m.edited && <button className="edited-tag" onClick={() => setHistory(m)}>Edited · a tiny plot twist</button>}{m.canEdit && now < m.editUntil && <button className="message-edit-button" onClick={() => { setEditing(m); setEditBody(m.body); setError('') }} aria-label="Edit your message"><Icon name="edit" size={11} />Edit</button>}</div></div></article>
            </div>)}
            {archived && <div className="left-family-banner"><span className="choice-symbol sage"><Icon name="heart" size={20} /></span><h3>{thread.status === 'disbanded' ? 'The chapter closed. The memories didn’t.' : 'You left the room, not the memories.'}</h3><p>{thread.rejoinNote}</p>{thread.status === 'left' && <button className="primary-button" disabled={busy || !thread.canRejoin} onClick={async () => { if (await mutate({ type: 'family.rejoin' })) onMembershipChange() }}>{busy ? 'Warming your seat…' : thread.canRejoin ? 'Ready for the reunion. Rejoin family' : thread.rejoinAt && thread.rejoinAt > now ? `Rejoin unlocks in ${Math.max(1, Math.ceil((thread.rejoinAt - now) / 86400000))} days` : 'Rejoin family'}<Icon name="arrow" size={16} /></button>}<small>This keepsake can’t be deleted. Future family messages stay with the family.</small></div>}
          </div>
          {topError}
          {editing ? <form className="message-composer edit-composer" onSubmit={async e => { e.preventDefault(); if (editAllowed && await mutate({ type: 'message.edit', messageId: editing.id, body: editBody, expectedVersion: editing.versions.length })) setEditing(null) }}>
            <div className={`editing-banner ${!editAllowed ? 'expired' : ''}`}><Icon name="clock" size={13} /><span>{editAllowed ? `Polishing your punchline · ${Math.max(0, Math.ceil((editing.editUntil - now) / 1000))}s left` : 'That edit window closed—or someone replied. A fresh follow-up is always welcome.'}</span><button type="button" aria-label="Cancel editing" onClick={() => setEditing(null)}><Icon name="close" size={15} /></button></div><div className="composer-input"><textarea aria-label="Edit message" rows={2} maxLength={2000} value={editBody} disabled={busy || !editAllowed} onChange={e => setEditBody(e.target.value)} /><button className="send-message-button" disabled={busy || !editAllowed || !editBody.trim()} aria-label="Save edited message"><Icon name="check" size={19} /></button></div><p>Save within 2½ minutes of sending, before another person replies. The original stays in edit history.</p>
          </form> : thread.canSend ? <form className="message-composer" onSubmit={async e => { e.preventDefault(); if (draft.trim() && await mutate({ type: 'message.send', body: draft })) setDraft('') }}>
            <div className="composer-input"><textarea aria-label="Your message" rows={1} maxLength={2000} placeholder={thread.kind === 'family' ? 'Drop a plan, a hello, or a very good dad joke…' : 'A little hello goes a long way…'} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }} /><button className="send-message-button" disabled={busy || !draft.trim()} aria-label="Send message"><Icon name="send" size={20} /></button></div><p><Icon name="spark" size={11} />Send a little thought. Make someone’s day.<span>{draft.length}/2000</span></p>
          </form> : <div className="read-only-composer"><Icon name="lock" size={15} /><span>{archived ? 'The send button’s taking a keepsake break.' : 'This conversation is a keepsake now.'}</span></div>}
        </>}
      </div>
    </div>

    {historyMessage && <ChatDialog title="The little plot twists." close={() => setHistory(null)}><p className="chat-dialog-intro">Same thought, a little fine-tuning. Here’s the whole story.</p><div className="revision-list">{historyMessage.versions.map((v, i) => <div key={v.sequence}><span>{i === 0 ? 'THE ORIGINAL' : `EDIT ${i}`}<time>{formatTime(v.at)}</time></span><p>{v.body}</p></div>)}</div></ChatDialog>}
    {aliases && thread && <ChatDialog title="Names only the family gets." close={() => { if (!busy) setAliases(false) }}><p className="chat-dialog-intro">A nickname for this chat, not a profile makeover. It stays even when someone leaves and comes back.</p><form className="chat-alias-form" onSubmit={async e => { e.preventDefault(); if (await mutate({ type: 'family.chat-alias', memberId: aliasMember, alias: aliasValue })) { setAliasMember(''); setAliasValue('') } }}><label>Your memory maker<select required disabled={busy} value={aliasMember} onChange={e => { setAliasMember(e.target.value); const m = thread.members.find(member => member.id === e.target.value); setAliasValue(m && m.name !== m.baseName ? m.name : '') }}><option value="">Pick a person…</option>{thread.members.map(m => <option key={m.id} value={m.id}>{m.baseName}{!m.active ? ' · away from the family' : ''}</option>)}</select></label><label>Family chat nickname<input maxLength={40} placeholder="Chief Snack Officer, perhaps?" value={aliasValue} disabled={busy || !aliasMember} onChange={e => setAliasValue(e.target.value)} /></label><p>Leave blank to use their display name or email again.</p>{topError}<button className="primary-button" disabled={busy || !aliasMember}>{busy ? 'Making the nickname stick…' : 'Save the family nickname'}<Icon name="check" size={16} /></button></form></ChatDialog>}
  </section>
}

function ChatDialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close() }, [])
  return <dialog ref={ref} className="chat-dialog" aria-label={title} onCancel={e => { e.preventDefault(); close() }} onClick={e => { if (e.target === e.currentTarget) close() }}><div><button className="modal-close" aria-label="Close dialog" onClick={close}><Icon name="close" size={19} /></button><span className="eyebrow">A LITTLE CONTEXT GOES A LONG WAY</span><h2>{title}</h2>{children}</div></dialog>
}
