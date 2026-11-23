import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type AuthView = 'login' | 'register'
const viewFromPath = (): AuthView => window.location.pathname === '/register' ? 'register' : 'login'

function AuthIcon({ name }: { name: 'heart' | 'mail' | 'lock' | 'eye' | 'hidden' | 'arrow' | 'check' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'heart' && <path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 4 12 8 15 4-3 13-10 8-15Z" />}
    {name === 'mail' && <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>}
    {name === 'lock' && <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>}
    {(name === 'eye' || name === 'hidden') && <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{name === 'hidden' && <path d="m3 3 18 18" />}</>}
    {name === 'arrow' && <path d="M4 12h16m-6-6 6 6-6 6" />}
    {name === 'check' && <path d="m5 12 4 4L19 6" />}
  </svg>
}

export default function AuthGate({ children, illustration }: {
  children: (session: Session, signOut: () => Promise<void>, signingOut: boolean) => ReactNode
  illustration: ReactNode
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [view, setView] = useState<AuthView>(viewFromPath)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const register = view === 'register'

  useEffect(() => {
    let active = true
    let authEventReceived = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true
      if (!active) return
      setSession(nextSession)
      setInitializing(false)
      if (nextSession) {
        setPassword('')
        setError('')
        setConfirmationEmail('')
        if (['/login', '/register'].includes(window.location.pathname)) window.history.replaceState(null, '', '/')
      }
    })
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return
      setSession(data.session)
      if (sessionError) setError('We couldn’t check your session. Please sign in again.')
      setInitializing(false)
    }).catch(() => {
      if (!active || authEventReceived) return
      setError('We couldn’t connect. Check your connection and try again.')
      setInitializing(false)
    })
    const onPopState = () => {
      setView(viewFromPath())
      setError('')
      setPassword('')
      setConfirmationEmail('')
    }
    window.addEventListener('popstate', onPopState)
    return () => { active = false; subscription.unsubscribe(); window.removeEventListener('popstate', onPopState) }
  }, [])

  function navigate(next: AuthView) {
    window.history.pushState(null, '', `/${next}`)
    setView(next)
    setError('')
    setPassword('')
    setShowPassword(false)
    setConfirmationEmail('')
    headingRef.current?.focus()
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const credentials = { email: email.trim(), password }
      const { data, error: authError } = register
        ? await supabase.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        })
        : await supabase.auth.signInWithPassword(credentials)
      if (authError) {
        const messages: Record<string, string> = {
          invalid_credentials: 'That email and password aren’t a match. Even great teams need a second try.',
          email_not_confirmed: 'One tiny detour: confirm your email using the link in your inbox, then come back.',
          user_already_exists: 'You may already be part of the adventure. Try logging in instead.',
          weak_password: 'Give that password a little more muscle. Try a longer mix of words, numbers, and symbols.',
          over_email_send_rate_limit: 'Our email carrier needs a breather. Wait a moment before trying again.',
          over_request_rate_limit: 'A little too speedy! Please wait a moment and try again.',
          signup_disabled: 'New signups are currently paused. Please try again later.',
        }
        setError(messages[authError.code ?? ''] ?? 'We couldn’t finish that. Please check your details and try again.')
      } else if (register && !data.session) {
        setConfirmationEmail(credentials.email)
        setPassword('')
      } else if (data.session) {
        setSession(data.session)
        setPassword('')
        window.history.replaceState(null, '', '/')
      }
    } catch {
      setError('A small bump in the road. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setSigningOut(true)
    setError('')
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) throw signOutError
      setSession(null)
      setEmail('')
      navigate('login')
    } catch {
      setError('We couldn’t sign you out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  if (initializing) return <main className="auth-loading" role="status"><span className="brand-symbol"><AuthIcon name="heart" /></span><p>Gathering the good stuff…</p></main>
  if (session) return <>{error && <div className="auth-signout-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss notification">Dismiss</button></div>}{children(session, signOut, signingOut)}</>

  return <div className="auth-page">
    <header className="auth-header">
      <a className="brand" href="/login" onClick={e => { e.preventDefault(); navigate('login') }} aria-label="Family Bucket home"><span className="brand-symbol"><AuthIcon name="heart" /></span><span>family<span className="brand-light">bucket</span><span className="brand-dot">.</span></span></a>
      <p>{register ? 'Already in the family?' : 'New around here?'} <a href={register ? '/login' : '/register'} onClick={e => { e.preventDefault(); if (!busy) navigate(register ? 'login' : 'register') }}>{register ? 'Log in' : 'Join the fun'} <span aria-hidden="true">↗</span></a></p>
    </header>
    <main className="auth-layout">
      <section className="auth-story" aria-label="A little list. A lot of life.">
        <span className="eyebrow"><span /> A LITTLE LIST. A LOT OF LIFE.</span>
        <h2>Less “one day.”<br />More <span>“remember<br className="auth-story-break" /> when?”<svg viewBox="0 0 330 15" preserveAspectRatio="none"><path d="M4 8Q160-2 326 7M18 13Q160 5 315 13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span></h2>
        <p>Big adventures. Tiny traditions. Questionable pizza.<br />Make room for all your family’s good stuff.</p>
        <div className="auth-art">
          <span className="auth-art-note">Your next great<br />story goes here.<svg viewBox="0 0 70 60"><path d="M5 5c40-4 50 20 39 45m-5-12 5 13 12-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span>
          {illustration}
          <span className="auth-sticker"><AuthIcon name="check" /> Make a memory</span>
        </div>
        <div className="auth-story-footer"><AuthIcon name="heart" /><span>Not a to-do list. A together-do list.</span></div>
      </section>
      <section className="auth-form-panel">
        {confirmationEmail ? <div className="auth-form-content auth-confirmation">
          <div className="auth-welcome-icon"><AuthIcon name="mail" /></div>
          <span className="eyebrow">ONE TINY DETOUR</span>
          <h1 ref={headingRef} tabIndex={-1}>You’ve got mail.<br /><span>(The good kind.)</span></h1>
          <p role="status">If signup is available for <strong>{confirmationEmail}</strong>, you’ll receive a confirmation link. Give it a click, then log in to start dreaming.</p>
          <div className="auth-mail-tip"><AuthIcon name="mail" /><p>Not seeing it? Check spam. Even good adventures occasionally take a wrong turn.</p></div>
          <button className="primary-button auth-submit" onClick={() => navigate('login')}>Back to log in <AuthIcon name="arrow" /></button>
          <button className="auth-change-email" onClick={() => setConfirmationEmail('')}>Typo in your email? Let’s fix it.</button>
        </div> : <div className="auth-form-content">
          <div className="auth-welcome-icon"><AuthIcon name={register ? 'heart' : 'lock'} /></div>
          <span className="eyebrow">{register ? 'YOUR SOMEDAY STARTS HERE' : 'YOUR PEOPLE. YOUR PLANS. YOUR PLACE.'}</span>
          <h1 ref={headingRef} tabIndex={-1}>{register ? <>Good memories<br />start with <span>“I’m in.”</span></> : <>Welcome back,<br /><span>memory maker.</span></>}</h1>
          <p>{register ? 'Two little fields. A whole bucket of possibilities.' : 'The bucket’s right where you left it. Let’s get back to the good stuff.'}</p>
          <div className="auth-view-tabs" aria-label="Account access"><a href="/login" className={!register ? 'selected' : ''} aria-current={!register ? 'page' : undefined} onClick={e => { e.preventDefault(); if (!busy) navigate('login') }}>Log in</a><a href="/register" className={register ? 'selected' : ''} aria-current={register ? 'page' : undefined} onClick={e => { e.preventDefault(); if (!busy) navigate('register') }}>Create an account</a></div>
          <form onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy}>
              <label htmlFor="auth-email">Your email<span>No carrier pigeons required.</span></label>
              <div className="auth-input-wrap"><AuthIcon name="mail" /><input id="auth-email" type="email" autoComplete="email" required maxLength={254} placeholder="you@yourhappyplace.com" value={email} onChange={e => setEmail(e.target.value)} aria-describedby={error ? 'auth-error' : undefined} /></div>
              <label htmlFor="auth-password">Your password<span>{register ? 'A secret. Not the family dog’s name.' : 'The secret handshake, in letters.'}</span></label>
              <div className="auth-input-wrap"><AuthIcon name="lock" /><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : undefined} placeholder={register ? 'At least 8 characters of mystery' : 'Your super-secret password'} value={password} onChange={e => setPassword(e.target.value)} aria-describedby={[register ? 'password-hint' : '', error ? 'auth-error' : ''].filter(Boolean).join(' ') || undefined} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><AuthIcon name={showPassword ? 'hidden' : 'eye'} /></button></div>
              {register && <p className="auth-password-hint" id="password-hint">8+ characters. A few unexpected twists make it stronger.</p>}
              {error && <p className="auth-error" id="auth-error" role="alert">{error}</p>}
              <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? (register ? 'Making room in the bucket…' : 'Opening the good stuff…') : (register ? 'Count me in' : 'Let me in on the good stuff')}<AuthIcon name="arrow" /></button>
            </fieldset>
          </form>
          <div className="auth-reassurance"><AuthIcon name={register ? 'check' : 'lock'} /><span>{register ? 'Just email + password. No life story required.' : 'Your password stays private. Your dreams can be big.'}</span></div>
          <p className="auth-switch-copy">{register ? 'Already collecting memories?' : 'No bucket to call your own yet?'} <a href={register ? '/login' : '/register'} onClick={e => { e.preventDefault(); if (!busy) navigate(register ? 'login' : 'register') }}>{register ? 'Welcome back. Log in' : 'Let’s start one'}</a></p>
        </div>}
        <p className="auth-form-footnote">A little less scrolling. A little more living.</p>
      </section>
    </main>
    <footer className="auth-footer"><span>Made for your kind of together.</span><span>Small plans. Big heart.</span></footer>
  </div>
}
