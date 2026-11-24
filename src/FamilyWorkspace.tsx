import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { BucketArt, Icon } from './ui'
import { loadWorkspace, request, runAction, type Workspace } from './lib/workspace'
import { WorkspaceRequestError } from './lib/workspace-errors'

const categories = ['Adventure', 'Food & fun', 'Travel', 'Little joys']
const blankWish = { title: '', note: '', date: '', category: 'Adventure' }
type Page = 'list' | 'memories' | 'family' | 'profile'
type Wish = Workspace['wishes'][number]
type Confirm = { title: string; description: string; label: string; action: Record<string, unknown> }

function Brand({ onClick }: { onClick: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="Family Bucket home"><span className="brand-symbol"><Icon name="heart" size={23} /></span><span>family<span className="brand-light">bucket</span><span className="brand-dot">.</span></span></button>
}
function Dialog({ children, titleId, close, busy = false }: { children: ReactNode; titleId: string; close: () => void; busy?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const el = ref.current
    el?.focus()
    function keydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) closeRef.current()
      if (e.key === 'Tab' && el) {
        const nodes = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]')]
        if (!nodes.length) { e.preventDefault(); return }
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === el)) { e.preventDefault(); first.focus() }
      }
    }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; previous?.focus() }
  }, [busy])
  return <div className="modal-backdrop" onClick={() => { if (!busy) close() }}><section ref={ref} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}><button className="modal-close" disabled={busy} aria-label="Close dialog" onClick={close}><Icon name="close" /></button>{children}</section></div>
}
function FamilyChoices({ hasCreated, busy, act, onboarding = false }: { hasCreated: boolean; busy: boolean; act: (action: Record<string, unknown>) => Promise<boolean>; onboarding?: boolean }) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [value, setValue] = useState('')
  return <div className="family-choices">
    {mode === 'choose' ? <>
      <div className="choice-grid">
        <button className="choice-card" disabled={busy || hasCreated} onClick={() => { setMode('create'); setValue('') }}><span className="choice-symbol sage"><Icon name="plus" size={24} /></span><h3>Create a family</h3><p>{hasCreated ? 'You’ve created your one family. Join a new crew instead.' : 'Start your own little crew. Bring the big ideas.'}</p><span className="choice-link">{hasCreated ? 'One creation per account' : 'I’ll bring the bucket'}{!hasCreated && <Icon name="arrow" size={16} />}</span></button>
        <button className="choice-card" disabled={busy} onClick={() => { setMode('join'); setValue('') }}><span className="choice-symbol peach"><Icon name="people" size={24} /></span><h3>Join a family</h3><p>Already have your people? Their invite code is your way in.</p><span className="choice-link">I know the secret handshake<Icon name="arrow" size={16} /></span></button>
      </div>
      {onboarding && <><button className="skip-button" disabled={busy} onClick={() => void act({ type: 'onboarding.skip' })}>{busy ? 'One little moment…' : 'Just me for now. I’ve got plans, too.'}<Icon name="arrow" size={15} /></button><p className="choice-footnote">Skipping keeps your bucket list personal. You can find your crew later.</p></>}
    </> : <form className="settings-form family-choice-form" onSubmit={async e => { e.preventDefault(); if (await act(mode === 'create' ? { type: 'family.create', name: value } : { type: 'family.join', code: value })) { setMode('choose'); setValue('') } }}>
      <button className="back-link" type="button" disabled={busy} onClick={() => setMode('choose')}>← Back to the possibilities</button>
      <h3>{mode === 'create' ? 'Every great crew needs a name.' : 'Got the code? You’re practically family.'}</h3>
      <p>{mode === 'create' ? 'The Pancake People? The Weekend Wanderers? Make it yours.' : 'Ask a family member for the code in their Family page.'}</p>
      <label>{mode === 'create' ? 'Family name' : 'Invitation code'}<input autoFocus required maxLength={mode === 'create' ? 60 : 32} placeholder={mode === 'create' ? 'The Weekend Wanderers' : 'e.g. A1B2C3D4E5F6'} value={value} onChange={e => setValue(e.target.value)} autoCapitalize={mode === 'join' ? 'characters' : 'words'} spellCheck={mode !== 'join'} disabled={busy} /></label>
      <button className="primary-button" disabled={busy}>{busy ? 'Getting the crew together…' : mode === 'create' ? 'Make us a family' : 'Let me meet the crew'}<Icon name="arrow" size={16} /></button>
      <p className="form-help">{mode === 'create' ? 'One family creation per account. One family membership at a time.' : 'Your own wishes come with you and will be visible to your new family.'}</p>
    </form>}
  </div>
}

export default function FamilyWorkspace({ userId, email, onSignOut, signingOut }: { userId: string; email: string; onSignOut: () => Promise<void>; signingOut: boolean }) {
  const pageFromPath = (): Page => window.location.pathname === '/profile' ? 'profile' : window.location.pathname === '/family' ? 'family' : window.location.pathname === '/memories' ? 'memories' : 'list'
  const [page, setPage] = useState<Page>(pageFromPath)
  const [data, setData] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [serviceMissing, setServiceMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('All wishes')
  const [personFilter, setPersonFilter] = useState('all')
  const [wishForm, setWishForm] = useState<typeof blankWish | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteText, setDeleteText] = useState('')
  const busyRef = useRef(false)
  const sequence = useRef(0)
  const alive = useRef(true)

  async function refresh() {
    if (busyRef.current) return
    const seq = ++sequence.current
    try {
      const next = await loadWorkspace()
      if (alive.current && seq === sequence.current) { setData(next); setError(''); setServiceMissing(false) }
    } catch (e) {
      if (alive.current && seq === sequence.current) {
        setError(e instanceof Error ? e.message : 'Your bucket couldn’t connect.')
        setServiceMissing(e instanceof WorkspaceRequestError && e.status === 404)
      }
    } finally {
      if (alive.current && seq === sequence.current) setLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void refresh()
    const interval = window.setInterval(() => { if (!document.hidden) void refresh() }, 20000)
    const focus = () => { void refresh() }
    const pop = () => setPage(pageFromPath())
    window.addEventListener('focus', focus)
    window.addEventListener('popstate', pop)
    return () => { alive.current = false; ++sequence.current; window.clearInterval(interval); window.removeEventListener('focus', focus); window.removeEventListener('popstate', pop) }
  }, [])

  function navigate(next: Page) {
    setPage(next)
    setError('')
    setNotice('')
    setPersonFilter('all')
    window.history.pushState(null, '', next === 'list' ? '/' : `/${next === 'family' ? 'family' : next}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  async function act(action: Record<string, unknown>) {
    if (busyRef.current) return false
    busyRef.current = true
    ++sequence.current
    setBusy(true)
    setError('')
    try {
      const next = await runAction(action)
      if (alive.current) { setData(next); setLoading(false) }
      return true
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'That didn’t quite work. Try again.')
      return false
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function deleteAccount(e: FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    ++sequence.current
    setBusy(true)
    setError('')
    try {
      await request('/delete-account', { confirmation: deleteText, password: deletePassword })
      setDeletePassword('')
      await onSignOut()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We couldn’t delete your account. Please try again.')
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }
  function openWish(wish?: Wish) {
    setError('')
    setEditing(wish?.id ?? null)
    setWishForm(wish ? { title: wish.title, note: wish.note, date: wish.date, category: wish.category } : { ...blankWish })
  }
  const family = data?.family
  const listTitle = family ? 'Our bucket list' : 'My bucket list'
  const owner = family?.ownerId === userId
  const done = data?.wishes.filter(w => w.done).length ?? 0
  const filtered = data?.wishes.filter(w => (personFilter === 'all' || w.ownerId === personFilter) && (page === 'memories' || tab === 'We did it!' ? w.done : tab === 'Still dreaming' ? !w.done : true)) ?? []
  const nav = [{ id: 'list', label: listTitle, icon: 'list' }, { id: 'memories', label: 'Memories', icon: 'heart' }, { id: 'family', label: 'Family', icon: 'people' }, { id: 'profile', label: 'Profile', icon: 'edit' }] as const
  const errorBlock = error && <div className="workspace-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" size={15} /></button></div>
  const showOnboarding = data && !data.profile.onboarded

  return <div className="app workspace-app">
    <header className="site-header workspace-header"><Brand onClick={() => navigate('list')} /><nav className="desktop-nav" aria-label="Main navigation">{nav.map(n => <button key={n.id} className={page === n.id ? 'nav-active' : ''} onClick={() => navigate(n.id)}>{n.label}</button>)}</nav><div className="account-actions"><button className="profile-shortcut" onClick={() => navigate('profile')} aria-label="Open your profile"><span className="avatar sage">{data?.profile.alias[0]?.toUpperCase() ?? 'Y'}</span><span>{data?.profile.alias ?? 'Your account'}</span></button><button className="account-signout" disabled={signingOut || busy} onClick={() => void onSignOut()}>{signingOut ? 'Leaving…' : 'Log out'}</button></div></header>

    {loading ? <main className="workspace-loading" role="status"><Icon name="heart" size={28} /><h2>Gathering the good stuff…</h2><p>Your plans are worth the tiny wait.</p></main> : !data ? <main className="workspace-loading">
      {serviceMissing ? <section className="service-setup-card">
        <span className="service-auth-status"><Icon name="check" size={16} />Signed in successfully</span>
        <h2>You’re in.<br />The bucket’s still unpacking.</h2>
        <p>Your login worked for <strong>{email}</strong>. The shared bucket-list backend still needs a one-time Supabase setup. You don’t need to register again or reset your password.</p>
        <ol><li>Run <code>supabase/setup.sql</code> in Supabase’s SQL Editor.</li><li>Deploy the Edge Function using <code>supabase/README.md</code>.</li><li>Come back here and retry. Your signed-in session will be kept.</li></ol>
        <button className="primary-button" onClick={() => { setLoading(true); void refresh() }}>I’ve deployed it. Try again<Icon name="arrow" size={16} /></button>
        <button className="service-signout" disabled={signingOut} onClick={() => void onSignOut()}>Or log out for now</button>
      </section> : <>{errorBlock}<h2>A tiny detour, not a dead end.</h2><p>We couldn’t open your saved bucket. Give it another go.</p><button className="primary-button" onClick={() => { setLoading(true); void refresh() }}>Try again<Icon name="arrow" size={16} /></button></>}
    </main> : showOnboarding ? <main className="onboarding-page">
      <span className="eyebrow">WELCOME TO YOUR NEXT “REMEMBER WHEN”</span><div className="onboarding-art"><BucketArt /></div><h1>Good plans love<br /><span>good company.</span></h1><p>Start a family, join your favorite people, or keep a little bucket just for you.<br />There’s no wrong way to make a memory.</p>
      {errorBlock}<FamilyChoices hasCreated={data.profile.hasCreatedGroup} busy={busy} act={act} onboarding />
      <span className="handwritten">Your kind of together starts here.</span>
    </main> : <main className="page workspace-main">
      {!wishForm && !confirm && !deletingAccount && errorBlock}
      {notice && <div className="workspace-notice" role="status"><Icon name="check" size={16} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><Icon name="close" size={15} /></button></div>}
      {(page === 'list' || page === 'memories') && <>
        <section className="hero"><div className="hero-copy"><span className="eyebrow"><span />{family ? family.name.toUpperCase() : 'YOUR LITTLE CORNER OF SOMEDAY'}</span><h1>Big little plans.<br />Really good <span className="memories-word">memories.<svg viewBox="0 0 340 14" preserveAspectRatio="none"><path d="M3 9Q160-3 336 7M16 13Q183 3 320 12" stroke="currentColor" strokeWidth="3" fill="none" /></svg></span></h1><p>For all the “one day, {family ? 'we' : 'I'} should” moments.<br className="mobile-break" /> Let’s make them happen.</p><div className="hero-bottom"><Icon name="spark" size={15} />{family ? 'Less someday. More family.' : 'Your list. Your pace. Your next great story.'}</div></div><div className="hero-illustration"><span className="hand-note">Good things<br />go in here.</span><BucketArt /></div></section>
        <div className="content-grid"><section className="list-section">
          <div className="section-heading"><div><span className="eyebrow section-eyebrow">{family ? `${family.name}’S LITTLE ADVENTURES` : `${data.profile.alias}’S LITTLE ADVENTURES`}</span><h2>{page === 'memories' ? 'Made-it-happen memories' : listTitle}<span className="heading-spark"><Icon name="spark" size={24} /></span></h2></div><button className="primary-button" disabled={busy} onClick={() => openWish()}><Icon name="plus" size={18} />Add a wish</button></div>
          <p className="section-subtitle">{family ? 'Everyone’s wishes. One very good list. Your own wishes are yours to edit.' : 'A little space for everything you’d love to do. Saved just for you.'}</p>
          <div className="list-toolbar"><div className="tabs" role="tablist" aria-label="Filter wishes">{(page === 'memories' ? ['We did it!'] : ['All wishes', 'Still dreaming', 'We did it!']).map(t => <button role="tab" key={t} aria-selected={page === 'memories' || tab === t} className={`tab ${page === 'memories' || tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}<span>{t === 'All wishes' ? data.wishes.length : t === 'We did it!' ? done : data.wishes.length - done}</span></button>)}</div>{family && <select aria-label="Filter wishes by family member" className="member-filter" value={personFilter} onChange={e => setPersonFilter(e.target.value)}><option value="all">Everyone</option>{data.members.map(m => <option key={m.id} value={m.id}>{m.id === userId ? 'My wishes' : m.alias}</option>)}</select>}</div>
          <div className="wish-list">{filtered.map(w => <article className={`wish-card ${w.done ? 'completed' : ''}`} key={w.id}>
            <button className="checkbox" disabled={busy || w.ownerId !== userId} aria-label={`${w.done ? 'Uncheck' : 'Complete'} ${w.title}`} aria-pressed={w.done} title={w.ownerId !== userId ? 'Only the person who made this wish can tick it off.' : undefined} onClick={() => void act({ type: 'wish.toggle', id: w.id, done: !w.done })}>{w.done && <Icon name="check" size={16} />}</button>
            <div className="wish-content"><div className="wish-topline"><span className={`category category-${categories.indexOf(w.category)}`}>{w.category}</span>{w.done && <span className="done-label">Memory made!</span>}</div><h3>{w.title}</h3><p>{w.note}</p><div className="wish-meta"><span><Icon name="calendar" size={13} />{new Date(`${w.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span><span>·</span><span><span className="mini-avatar">{w.person[0]?.toUpperCase()}</span>{w.ownerId === userId ? 'Your wish' : `${w.person}’s wish`}</span></div></div>
            {w.ownerId === userId && <div className="card-actions"><button disabled={busy} onClick={() => openWish(w)} aria-label={`Edit ${w.title}`}><Icon name="edit" size={16} /></button><button disabled={busy} onClick={() => setConfirm({ title: 'Let this wish go?', description: `“${w.title}” will be permanently removed from your list.`, label: 'Delete wish', action: { type: 'wish.delete', id: w.id } })} aria-label={`Delete ${w.title}`}><Icon name="trash" size={16} /></button></div>}
          </article>)}
          {!filtered.length && <div className="empty-state"><Icon name="spark" size={30} /><h3>{page === 'memories' || tab === 'We did it!' ? 'Your best stories are still ahead.' : 'An empty bucket. Endless possibilities.'}</h3><p>{page === 'memories' || tab === 'We did it!' ? 'Tick off your first wish and give it a home here.' : 'Big adventures or breakfast for dinner. It all belongs here.'}</p><button className="text-button" onClick={() => openWish()}>Dream up a wish<Icon name="arrow" size={16} /></button></div>}</div>
          <div className="list-footer"><Icon name="heart" size={14} />Not a to-do list. A together-do list.</div>
        </section><aside className="sidebar">
          <section className="progress-card"><div className="aside-topline"><span className="eyebrow">LOOK AT YOU GO</span><Icon name="spark" size={18} /></div><div className="progress-number">{done}<span> / {data.wishes.length}</span></div><h3>wishes turned into memories</h3><div className="progress-track"><div style={{ width: `${data.wishes.length ? done / data.wishes.length * 100 : 0}%` }} /></div><p>One little adventure at a time.<br />That’s how the good stuff adds up.</p><div className="progress-bottom"><Icon name="heart" size={15} />Collect moments, not things.</div></section>
          <section className="idea-card"><span className="idea-label">{family ? 'YOUR PEOPLE, ALL HERE' : 'GOOD COMPANY, OPTIONAL'}</span><h3>{family ? family.name : <>Your bucket.<br />Room for more.</>}</h3><p>{family ? `${data.members.length} ${data.members.length === 1 ? 'dreamer' : 'dreamers'}, one shared view. Everyone brings their own little big plans.` : 'Keep things personal, or invite your favorite people along for the ride.'}</p><button className="text-button" onClick={() => navigate('family')}>{family ? 'Meet your crew' : 'Find your family'}<Icon name="arrow" size={16} /></button></section>
          <p className="sync-note">Safely saved. Family updates refresh every 20 seconds and when you return.</p>
        </aside></div>
      </>}

      {page === 'profile' && <section className="settings-page">
        <div className="settings-page-heading"><span className="eyebrow">THE PERSON BEHIND THE PLANS</span><h1>A little more <span>you.</span></h1><p>Your name on the wishes. Your very own corner of the bucket.</p></div>
        <div className="settings-layout"><div className="settings-card"><div className="card-heading"><span className="choice-symbol sage"><Icon name="edit" /></span><div><h2>Your profile</h2><p>Real name, nickname, household legend. Your call.</p></div></div><AliasForm key={data.profile.alias} alias={data.profile.alias} email={email} busy={busy} save={async alias => { if (await act({ type: 'profile.alias', alias })) setNotice('New name, same excellent taste in adventures. Profile saved.') }} /></div>
        <aside className="profile-summary"><span className="profile-avatar">{data.profile.alias[0]?.toUpperCase()}</span><h3>{data.profile.alias}</h3><span className="membership-pill">{family ? family.name : 'Independent memory maker'}</span><p>{data.wishes.filter(w => w.ownerId === userId).length} wishes with your name on them.<br />And plenty of room for more.</p><button className="text-button" onClick={() => navigate('family')}>{family ? 'Manage your family' : 'Find your people'}<Icon name="arrow" size={16} /></button></aside></div>
        <div className="settings-card danger-card"><div><span className="eyebrow">THE SERIOUS LITTLE CORNER</span><h2>Time to close the bucket?</h2><p>Delete your account and all your wishes permanently. {owner ? 'Your family will be disbanded; other members keep their own wishes.' : 'Other family members keep their own wishes.'} There’s no undo on this one.</p></div><button className="danger-button" disabled={busy} onClick={() => { setError(''); setDeletePassword(''); setDeleteText(''); setDeletingAccount(true) }}><Icon name="trash" size={15} />Delete account</button></div>
      </section>}

      {page === 'family' && <section className="settings-page">
        <div className="settings-page-heading"><span className="eyebrow">BETTER TOGETHER, NEVER COMPLICATED</span><h1>{family ? <>Meet <span>your crew.</span></> : <>Find <span>your people.</span></>}</h1><p>{family ? 'Same family. Different dreams. One very good place to keep them.' : 'Your bucket is personal right now. Add a little together whenever you’re ready.'}</p></div>
        {family ? <><div className="family-banner"><span className="choice-symbol sage"><Icon name="people" size={27} /></span><div><span className="eyebrow">YOUR FAMILY</span><h2>{family.name}</h2><p>{data.members.length} {data.members.length === 1 ? 'member' : 'members'}<span>·</span>{owner ? 'You’re the creator. Keeper of the crew.' : 'You’ve got a place at this table.'}</p></div><span className="membership-pill">{owner ? 'Created by you' : 'Family member'}</span></div>
        <div className="settings-layout"><section className="settings-card"><div className="card-heading"><div><h2>The good company</h2><p>Every great adventure starts with these people.</p></div><span className="small-counter">{data.members.length}</span></div><div className="member-list">{data.members.map((m, i) => <div className="member-row" key={m.id}><span className={`avatar ${['sage', 'peach', 'lavender', 'yellow'][i % 4]}`}>{m.alias[0]?.toUpperCase()}</span><div><strong>{m.alias}{m.id === userId && <span> (you)</span>}</strong><small>{m.id === family.ownerId ? 'Family creator' : 'Fellow memory maker'}</small></div>{owner && m.id !== userId ? <button className="member-remove" disabled={busy} onClick={() => setConfirm({ title: `Remove ${m.alias} from the crew?`, description: 'They’ll keep their own wishes, but won’t see this family’s list. The invite code will change so they can’t rejoin with the old one.', label: 'Remove member', action: { type: 'family.kick', memberId: m.id } })}>Remove</button> : <Icon name={m.id === family.ownerId ? 'spark' : 'heart'} size={16} />}</div>)}</div></section>
        <section className="settings-card invite-card"><span className="choice-symbol peach"><Icon name="heart" size={23} /></span><h2>More people.<br />More “remember when.”</h2><p>Share this code with someone you’d love to make memories with.</p><span className="eyebrow">YOUR FAMILY INVITE CODE</span><code>{family.code.slice(0, 6)}-{family.code.slice(6)}</code><button className="primary-button" onClick={async () => { try { await navigator.clipboard.writeText(family.code); setNotice('Secret handshake copied. Send it to your favorite people.') } catch { setNotice('Copy unavailable here. Select the code above and copy it manually.') } }}>Copy invite code<Icon name="check" size={16} /></button><p className="form-help">Anyone with this code can join. Share it with care.</p></section></div>
        <div className="settings-card danger-card"><div><h2>{owner ? 'Disband this family' : 'Flying solo for a while?'}</h2><p>{owner ? 'As the creator, leaving closes this family for everyone. Each member keeps their own wishes. You won’t be able to create another family, but you can join one.' : 'Leave this family and return to your personal bucket list. Your own wishes come with you; access to everyone else’s stays here.'}</p></div><button className="danger-button" disabled={busy} onClick={() => setConfirm({ title: owner ? 'Close this chapter for the crew?' : 'A little solo adventure?', description: owner ? 'This family and its code will be removed for everyone. Other members and their wishes stay safe. Your one family creation has already been used.' : 'You’ll leave this family and keep your own wishes. You’ll need a valid invitation code if you want to rejoin.', label: owner ? 'Disband family' : 'Leave family', action: { type: 'family.leave' } })}>{owner ? 'Disband family' : 'Leave family'}</button></div>
        </> : <FamilyChoices hasCreated={data.profile.hasCreatedGroup} busy={busy} act={act} />}
      </section>}
      <footer className="page-footer"><span>Made for your kind of together.</span><span>familybucket.</span></footer>
    </main>}

    {data?.profile.onboarded && <nav className="mobile-nav workspace-mobile-nav" aria-label="Mobile navigation">{nav.map(n => <button key={n.id} className={page === n.id ? 'selected' : ''} onClick={() => navigate(n.id)}><Icon name={n.icon} size={20} />{n.id === 'list' ? family ? 'Our list' : 'My list' : n.label}</button>)}</nav>}
    {data?.profile.onboarded && family && data.profile.welcomeGroupId === family.id && <Dialog titleId="welcome-title" close={() => { void act({ type: 'welcome.dismiss' }) }} busy={busy}><div className="welcome-family"><span className="welcome-icon"><Icon name="people" size={33} /></span><span className="eyebrow">THE CREW JUST GOT EVEN BETTER</span><h2 id="welcome-title">Welcome to<br /><span>{family.name}.</span></h2><p>You bring the wishes. They bring the questionable jokes. Let the good memories begin.</p><div className="welcome-faces">{data.members.slice(0, 6).map((m, i) => <span key={m.id} className={`avatar ${['sage', 'peach', 'lavender', 'yellow'][i % 4]}`} title={m.alias}>{m.alias[0]?.toUpperCase()}</span>)}</div><p className="form-help">Your wishes now appear alongside everyone in this family.</p>{errorBlock}<button className="primary-button" disabled={busy} onClick={() => void act({ type: 'welcome.dismiss' })}>{busy ? 'One moment…' : 'Let’s make some memories'}<Icon name="arrow" size={16} /></button></div></Dialog>}
    {wishForm && <Dialog titleId="wish-title" close={() => { setWishForm(null); setError('') }} busy={busy}><span className="eyebrow">MAKE ROOM FOR THE GOOD STUFF</span><h2 id="wish-title">{editing ? 'A little change of plans.' : 'What’s your little big wish?'}</h2><form onSubmit={async e => { e.preventDefault(); if (await act({ type: 'wish.save', id: editing, ...wishForm })) setWishForm(null) }}><fieldset disabled={busy}><label>The wish<input required autoFocus maxLength={90} placeholder="One day, I should…" value={wishForm.title} onChange={e => setWishForm({ ...wishForm, title: e.target.value })} /></label><label>A little note<textarea rows={2} maxLength={300} placeholder="The fun details (optional)" value={wishForm.note} onChange={e => setWishForm({ ...wishForm, note: e.target.value })} /></label><div className="form-row"><label>Make a date<input required type="date" value={wishForm.date} onChange={e => setWishForm({ ...wishForm, date: e.target.value })} /></label><label>Kind of adventure<select value={wishForm.category} onChange={e => setWishForm({ ...wishForm, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label></div>{errorBlock}<button className="primary-button save-button">{busy ? 'Saving your someday…' : editing ? 'Save changes' : 'Into the bucket it goes'}<Icon name="check" size={16} /></button><p className="session-note">{family ? 'Saved to your account. Visible to your family.' : 'Saved to your account. Just for you.'}</p></fieldset></form></Dialog>}
    {confirm && <Dialog titleId="confirm-title" close={() => { setConfirm(null); setError('') }} busy={busy}><span className="eyebrow">A LITTLE DOUBLE-CHECK</span><h2 id="confirm-title">{confirm.title}</h2><p className="confirmation-description">{confirm.description}</p>{errorBlock}<div className="delete-buttons"><button className="secondary-button" disabled={busy} onClick={() => { setConfirm(null); setError('') }}>Keep things as they are</button><button className="primary-button" disabled={busy} onClick={async () => { if (await act(confirm.action)) { setConfirm(null); setPersonFilter('all') } }}>{busy ? 'One moment…' : confirm.label}</button></div></Dialog>}
    {deletingAccount && <Dialog titleId="delete-account-title" close={() => { setDeletingAccount(false); setDeletePassword(''); setError('') }} busy={busy}><span className="eyebrow">THIS ONE DOESN’T HAVE AN UNDO</span><h2 id="delete-account-title">Really close the bucket?</h2><p className="confirmation-description">Your account and wishes will be permanently deleted.{owner && ' Your family will also be disbanded. Other members keep their own wishes.'} To make sure it’s you, enter your password and type DELETE.</p><form onSubmit={deleteAccount}><fieldset disabled={busy}><label>Your password<input type="password" autoComplete="current-password" required value={deletePassword} onChange={e => setDeletePassword(e.target.value)} /></label><label>Type DELETE to confirm<input required pattern="DELETE" value={deleteText} onChange={e => setDeleteText(e.target.value)} autoComplete="off" /></label>{errorBlock}<button className="primary-button save-button" disabled={deleteText !== 'DELETE'}>{busy ? 'Closing your account…' : 'Permanently delete my account'}</button></fieldset></form></Dialog>}
  </div>
}

function AliasForm({ alias, email, busy, save }: { alias: string; email: string; busy: boolean; save: (alias: string) => Promise<void> }) {
  const [value, setValue] = useState(alias)
  return <form className="settings-form" onSubmit={e => { e.preventDefault(); void save(value.trim()) }}><label>Display name<input required maxLength={40} value={value} onChange={e => setValue(e.target.value)} disabled={busy} placeholder="What should the crew call you?" /><span>Your alias appears next to your wishes and in your family.</span></label><label>Email address<input type="email" value={email} readOnly /><span>Your login email. Only you can see it here.</span></label><button className="primary-button" disabled={busy || value.trim() === alias || !value.trim()}>{busy ? 'Saving your signature…' : 'Save my name'}<Icon name="check" size={16} /></button></form>
}
