import { useState } from 'react'
import { notificationsSupported } from '../state/notify'
import { getNotifyPref, setNotifyPref, useNotifyPref } from '../state/notifyPrefs'
import { t } from '../i18n'

export function NotifyToggle() {
  const pref = useNotifyPref()
  const [, forceUpdate] = useState(0)
  if (!notificationsSupported()) return null
  const permission = Notification.permission

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
            forceUpdate((n) => n + 1)
          })
        }}
      >
        {t('notify.enable')}
      </button>
    )
  }

  const on = pref === 'on'
  return (
    <button type="button" className="pill" onClick={() => setNotifyPref(getNotifyPref() === 'on' ? 'off' : 'on')}>
      {t(on ? 'notify.on' : 'notify.off')}
    </button>
  )
}
