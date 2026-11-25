import { useEffect, useState } from 'react'
import { Icon } from './ui'
import './download-app.css'

const dismissalKey = 'familybucket:download-app:dismissed'

function downloadUrl() {
  if (import.meta.env.VITE_APP_DOWNLOAD_ENABLED?.trim().toLowerCase() !== 'true') return null
  try {
    const url = new URL(import.meta.env.VITE_APP_DOWNLOAD_URL?.trim() ?? '')
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export default function DownloadAppBanner() {
  const url = downloadUrl()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissalKey) === '1' }
    catch { return false }
  })

  useEffect(() => {
    function syncDismissal(event: StorageEvent) {
      if (event.key === dismissalKey && event.newValue === '1') setDismissed(true)
    }
    window.addEventListener('storage', syncDismissal)
    return () => window.removeEventListener('storage', syncDismissal)
  }, [])

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(dismissalKey, '1') }
    catch { /* Keep it dismissed for this visit if browser storage is blocked. */ }
  }

  if (!url || dismissed) return null

  return <aside className="download-app-banner" aria-label="Download the Family Bucket app">
    <div className="download-app-content">
      <span className="download-app-symbol"><Icon name="phone" size={18} /></span>
      <p><strong>Good memories. Now pocket-sized.</strong><span>Your next “remember when” can come along.</span></p>
      <a href={url} target="_blank" rel="noopener noreferrer">Download app<Icon name="arrow" size={14} /></a>
      <button type="button" onClick={dismiss} aria-label="Dismiss app download banner" title="Got it. No more nudges."><Icon name="close" size={17} /></button>
    </div>
  </aside>
}
