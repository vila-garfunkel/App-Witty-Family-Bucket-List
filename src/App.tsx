import { useState } from 'react'

type Wish = { id: number; title: string; note: string; date: string; category: string; person: string; done: boolean }
type IconName = 'plus' | 'arrow' | 'check' | 'edit' | 'trash' | 'calendar' | 'close' | 'spark' | 'heart' | 'list' | 'people'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m5 12 14 0m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    edit: <><path d="m14 5 5 5M4 20l5-1L20 8a2.1 2.1 0 0 0-5-5L4 14z" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" /></>,
    heart: <path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 4 12 8 15 4-3 13-10 8-15Z" />,
    list: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8m-8 4h8m-8 4h5" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const initialWishes: Wish[] = [
  { id: 1, title: 'Sleep under a sky full of stars', note: 'Less screen time. More sky time.', date: '2026-08-15', category: 'Adventure', person: 'Dad', done: false },
  { id: 2, title: 'Have a very serious pizza competition', note: 'Flour everywhere. Regrets nowhere.', date: '2026-07-24', category: 'Food & fun', person: 'Mia', done: false },
  { id: 3, title: 'See the ocean. Jump in. Repeat.', note: 'A little saltwater fixes everything.', date: '2026-08-22', category: 'Travel', person: 'Mom', done: false },
  { id: 4, title: 'Build the world’s coziest blanket fort', note: 'No grown-up business allowed inside.', date: '2026-07-12', category: 'Little joys', person: 'Leo', done: true },
  { id: 5, title: 'Plant something and keep it alive', note: 'We believe in us. Mostly.', date: '2026-07-30', category: 'Little joys', person: 'Mom', done: false },
]
const people = ['Mom', 'Dad', 'Mia', 'Leo']
const categories = ['Adventure', 'Food & fun', 'Travel', 'Little joys']
const blankWish = { title: '', note: '', date: '', category: 'Adventure', person: 'Mom' }

function BucketArt() {
  return <svg className="bucket-art" viewBox="0 0 320 260" fill="none" aria-hidden="true">
    <ellipse cx="167" cy="234" rx="99" ry="9" fill="#E5D8BC" opacity=".45" />
    <path d="m102 115 14 105q49 24 100-4l15-104" fill="#F2B147" stroke="#443B30" strokeWidth="2.5" />
    <path d="m116 162 5 51q44 20 88-1l6-53" fill="#F5C66C" />
    <path d="M110 126c-36-100 134-103 113 1" stroke="#443B30" strokeWidth="4" />
    <path d="M112 126c-30-89 118-92 108 0" stroke="#F8E8C7" strokeWidth="3" />
    <path d="m127 115-7-62 65-10 10 74" fill="#FAF9F2" stroke="#443B30" strokeWidth="2" transform="rotate(-9 158 84)" />
    <path d="m139 64 26-6m-24 17 34-7m-32 18 26-6" stroke="#D9B7A2" strokeWidth="2" />
    <path d="m167 118 13-48 54 14-17 59" fill="#B4C7AD" stroke="#443B30" strokeWidth="2" />
    <path d="m190 95 6 9 16-13" stroke="#53694E" strokeWidth="3" />
    <ellipse cx="166" cy="123" rx="66" ry="17" fill="#F6C166" stroke="#443B30" strokeWidth="2.5" />
    <path d="M102 123c14 16 101 29 129-1" stroke="#443B30" strokeWidth="2" />
    <path d="M150 167c-7-15-25-6-17 7l21 21 19-23c9-15-13-20-23-5Z" fill="#EF795F" stroke="#443B30" strokeWidth="2" />
    <path d="m245 52 4 12 13 2-12 6-1 13-7-11-13 1 9-10-2-13 9 8" fill="#EF795F" />
    <path d="m70 125 3 8 9 2-8 4-1 9-5-8-9 1 6-7-2-9 7 5" fill="#A9BA9F" />
    <path d="m80 56 9 6m-1-24 3 10m-27-5 8 4M258 160l10-4m-12 18 10 3" stroke="#443B30" strokeWidth="2" strokeLinecap="round" />
    <path d="M78 192c-20-16-41 6-24 13 13 5 21-16 5-24" stroke="#A4B298" strokeWidth="2" strokeLinecap="round" />
  </svg>
}

export default function App() {
  const [wishes, setWishes] = useState(initialWishes)
  const [tab, setTab] = useState('All wishes')
  const [section, setSection] = useState('Our bucket list')
  const [modal, setModal] = useState<'wish' | 'family' | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [form, setForm] = useState(blankWish)
  const [deleting, setDeleting] = useState<number | null>(null)
  const done = wishes.filter(w => w.done).length
  const visible = wishes.filter(w => section === 'Memories' ? w.done : tab === 'Still dreaming' ? !w.done : tab === 'We did it!' ? w.done : true)
  function openWish(wish?: Wish) {
    setEditing(wish?.id ?? null)
    setForm(wish ? { title: wish.title, note: wish.note, date: wish.date, category: wish.category, person: wish.person } : blankWish)
    setModal('wish')
  }
  function saveWish(e: React.FormEvent) {
    e.preventDefault()
    setWishes(current => editing ? current.map(w => w.id === editing ? { ...w, ...form } : w) : [...current, { ...form, id: Date.now(), done: false }])
    setModal(null)
  }
  return (
    <div className="app">
      <header className="site-header">
        <a href="#" className="brand" onClick={() => setSection('Our bucket list')}><span className="brand-symbol"><Icon name="heart" size={23} /></span><span>family<span className="brand-light">bucket</span><span className="brand-dot">.</span></span></a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {(['Our bucket list', 'Memories'] as const).map((item) => <button key={item} onClick={() => { setSection(item); setTab('All wishes') }} className={section === item ? 'nav-active' : ''}>{item}</button>)}
        </nav>
        <button className="family-switch" onClick={() => setModal('family')}><span className="avatar-stack"><span className="avatar peach">J</span><span className="avatar sage">A</span><span className="avatar lavender">M</span><span className="avatar yellow">L</span></span><span>The Millers <span className="chevron">⌄</span></span></button>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-copy"><span className="eyebrow"><span /> A LITTLE LIST. A LOT OF LIFE.</span><h1>Big little plans.<br />Really good <span className="memories-word">memories.<svg viewBox="0 0 340 14" preserveAspectRatio="none"><path d="M3 9Q160-3 336 7M16 13Q183 3 320 12" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" /></svg></span></h1><p>For all the “one day, we should” moments.<br className="mobile-break" /> Let’s make them happen, together.</p><div className="hero-bottom"><span className="tiny-stars">✦</span> Less someday. More family.</div></div>
          <div className="hero-illustration"><span className="hand-note">Good things<br />go in here.<svg viewBox="0 0 60 45"><path d="M5 4c30-3 44 12 36 32m-7-8 7 10 10-6" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg></span><BucketArt /></div>
        </section>

        <div className="content-grid">
          <section className="list-section">
            <div className="section-heading"><div><span className="eyebrow section-eyebrow">THE MILLER FAMILY’S</span><h2>{section === 'Memories' ? 'Made-it-happen memories' : 'Our bucket list'}<span className="heading-spark">✳</span></h2></div><button className="primary-button" onClick={() => openWish()}><Icon name="plus" size={18} /><span>Add a wish</span></button></div>
            <p className="section-subtitle">{section === 'Memories' ? 'The best part of a wish? Turning it into a story.' : 'Dream it. List it. Do it. Probably take too many photos.'}</p>
            <div className="list-toolbar"><div className="tabs" role="tablist" aria-label="Filter wishes">{(section === 'Memories' ? ['We did it!'] : ['All wishes', 'Still dreaming', 'We did it!']).map(t => <button role="tab" aria-selected={section === 'Memories' || tab === t} className={(section === 'Memories' || tab === t) ? 'tab active' : 'tab'} key={t} onClick={() => setTab(t)}>{t}<span>{t === 'All wishes' ? wishes.length : t === 'Still dreaming' ? wishes.length - done : done}</span></button>)}</div><span className="wish-count">{visible.length} little {visible.length === 1 ? 'adventure' : 'adventures'}</span></div>
            <div className="wish-list">
              {visible.map(wish => <article className={`wish-card ${wish.done ? 'completed' : ''}`} key={wish.id}>
                <button className="checkbox" aria-label={`${wish.done ? 'Uncheck' : 'Complete'} ${wish.title}`} aria-pressed={wish.done} onClick={() => setWishes(wishes.map(w => w.id === wish.id ? { ...w, done: !w.done } : w))}>{wish.done && <Icon name="check" size={17} />}</button>
                <div className="wish-content"><div className="wish-topline"><span className={`category category-${categories.indexOf(wish.category)}`}>{wish.category}</span>{wish.done && <span className="done-label">Memory made!</span>}</div><h3>{wish.title}</h3><p>{wish.note}</p><div className="wish-meta"><span><Icon name="calendar" size={13} />{new Date(`${wish.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span><span className="meta-dot">·</span><span><span className={`mini-avatar member-${wish.person}`}>{wish.person[0]}</span>{wish.person}’s wish</span></div></div>
                <div className="card-actions"><button aria-label={`Edit ${wish.title}`} onClick={() => openWish(wish)}><Icon name="edit" size={16} /></button><button aria-label={`Delete ${wish.title}`} onClick={() => setDeleting(wish.id)}><Icon name="trash" size={16} /></button></div>
              </article>)}
              {!visible.length && <div className="empty-state"><Icon name="spark" size={30} /><h3>{section === 'Memories' || tab === 'We did it!' ? 'The good stories are coming.' : 'Room for a little more magic.'}</h3><p>{section === 'Memories' || tab === 'We did it!' ? 'Tick off a wish to save your first memory here.' : 'Add a wish and give your next adventure a starting point.'}</p><button onClick={() => openWish()} className="text-button">Dream up a wish <Icon name="arrow" size={16} /></button></div>}
            </div>
            <div className="list-footer"><Icon name="heart" size={14} /><span>Not a to-do list. A together-do list.</span></div>
          </section>

          <aside className="sidebar">
            <section className="progress-card"><div className="aside-topline"><span className="eyebrow">LOOK AT YOU GO</span><Icon name="spark" size={18} /></div><div className="progress-number">{done}<span> / {wishes.length}</span></div><h3>wishes turned into memories</h3><div className="progress-track"><div style={{ width: `${wishes.length ? done / wishes.length * 100 : 0}%` }} /></div><p>One little adventure at a time.<br />That’s how the good stuff adds up.</p><div className="progress-bottom"><span className="little-flower">✳</span><span>Collect moments, not things.</span></div></section>
            <section className="idea-card"><span className="idea-label">A LITTLE INSPIRATION</span><span className="idea-star">✧</span><h3>Big memories.<br />Tiny price tags.</h3><p>A living-room campout. A sunrise walk. Breakfast for dinner.<br />The best wishes don’t cost much.</p><button className="text-button" onClick={() => { openWish(); setForm({ ...blankWish, title: 'Have a living-room campout', note: 'All the adventure. None of the mosquitoes.', category: 'Little joys' }) }}>Add a little joy <Icon name="arrow" size={17} /></button></section>
            <div className="sidebar-note"><svg viewBox="0 0 90 38"><path d="M4 12c30 30 56 10 69-5m-11 0 13-3-2 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg><p>Your future favorite stories<br />start right here.</p></div>
          </aside>
        </div>
        <footer className="page-footer"><span>Made for your kind of together.</span><span>familybucket.</span></footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation"><button className={section === 'Our bucket list' ? 'selected' : ''} onClick={() => setSection('Our bucket list')}><Icon name="list" size={20} />Our list</button><button className="mobile-add" onClick={() => openWish()} aria-label="Add a wish"><Icon name="plus" size={24} /></button><button className={section === 'Memories' ? 'selected' : ''} onClick={() => setSection('Memories')}><Icon name="heart" size={20} />Memories</button></nav>

      {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button className="modal-close icon-button" aria-label="Close" onClick={() => setModal(null)}><Icon name="close" /></button>{modal === 'family' ? <><span className="eyebrow">YOUR FAVORITE PEOPLE</span><h2 id="modal-title">Meet the Millers.</h2><p className="modal-intro">Four dreamers. One very good list.</p><div className="family-members">{people.map((person, i) => <div key={person}><span className={`avatar ${['peach', 'sage', 'lavender', 'yellow'][i]}`}>{person[0]}</span><strong>{person}</strong><span>{wishes.filter(w => w.person === person).length} wishes</span></div>)}</div></> : <><span className="eyebrow">MAKE ROOM FOR THE GOOD STUFF</span><h2 id="modal-title">{editing ? 'A little change of plans.' : 'What’s your little big wish?'}</h2><form onSubmit={saveWish}><label>The wish<input autoFocus required maxLength={90} placeholder="One day, we should…" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label><label>A little note<textarea rows={2} placeholder="The fun details (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label><label>Make a date<input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label><div className="form-row"><label>Kind of adventure<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Whose wish?<select value={form.person} onChange={e => setForm({ ...form, person: e.target.value })}>{people.map(p => <option key={p}>{p}</option>)}</select></label></div><button type="submit" className="primary-button save-button"><Icon name={editing ? 'check' : 'plus'} size={18} />{editing ? 'Save changes' : 'Into the bucket it goes'}</button><p className="session-note">Your wishes stay here for this visit.</p></form></>}</section></div>}
      {deleting !== null && <div className="modal-backdrop" onClick={() => setDeleting(null)}><section className="modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title" onClick={e => e.stopPropagation()}><span className="eyebrow">A CHANGE OF PLANS?</span><h2 id="delete-title">Let this wish go?</h2><p>“{wishes.find(w => w.id === deleting)?.title}” will be removed from your family’s list.</p><div className="delete-buttons"><button className="secondary-button" onClick={() => setDeleting(null)}>Keep dreaming</button><button className="primary-button" onClick={() => { setWishes(wishes.filter(w => w.id !== deleting)); setDeleting(null) }}>Delete wish</button></div></section></div>}
    </div>
  )
}
