import { useState, useSyncExternalStore } from 'react'
import { notificationsSupported } from '../state/notify'
import { getNotifyPref, setNotifyPref, useNotifyPref } from '../state/notifyPrefs'
import { t } from '../i18n'

/**
 * Browser permission is one-way from the page's side (a site can request it but never revoke
 * it), so once granted this button is an in-app mute layered on top. The permission itself can
 * still change in the browser's site settings while the tab stays open, so it is re-read on
 * Permissions API change events and, as a fallback, whenever the page regains focus.
 */
function subscribePermission(onChange: () => void): () => void {
  window.addEventListener('focus', onChange)
  document.addEventListener('visibilitychange', onChange)
  let status: PermissionStatus | null = null
  let cancelled = false
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((s) => {
      if (cancelled) return
      status = s
      s.addEventListener('change', onChange)
    })
    .catch(() => {
      // Permissions API missing or doesn't know "notifications": the focus fallback covers it.
    })
  return () => {
    cancelled = true
    window.removeEventListener('focus', onChange)
    document.removeEventListener('visibilitychange', onChange)
    status?.removeEventListener('change', onChange)
  }
}

const readPermission = () => Notification.permission

export function NotifyToggle() {
  if (!notificationsSupported()) return null
  return <div className="notify-row"><ToggleButton /></div>
}

function ToggleButton() {
  const pref = useNotifyPref()
  const permission = useSyncExternalStore(subscribePermission, readPermission)
  const [, rerender] = useState(0)

  if (permission === 'denied') {
    return (
      <button type="button" className="pill" disabled title={t('notify.blockedHint')}>
        {t('notify.blocked')}
      </button>
    )
  }

  if (permission === 'default') {
    return (
      <button
        type="button"
        className="pill"
        onClick={() => {
          void Notification.requestPermission().then((p) => {
            if (p === 'granted') setNotifyPref('on')
            rerender((n) => n + 1)
          })
        }}
      >
        {t('notify.enable')}
      </button>
    )
  }

  const on = pref === 'on'
  return (
    <button
      type="button"
      className="pill"
      aria-pressed={on}
      title={t(on ? 'notify.muteHint' : 'notify.unmuteHint')}
      onClick={() => setNotifyPref(getNotifyPref() === 'on' ? 'off' : 'on')}
    >
      <span aria-hidden>{on ? '🔔' : '🔕'}</span>
      {t(on ? 'notify.on' : 'notify.off')}
    </button>
  )
}
