import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { QrCode } from './QrCode'
import { Sheet } from './Sheet'
import { Toast, TOAST_MS } from './Toast'

/** QR code + invite link + copy button, in a popup. */
export function ShareSheet({ link, onClose }: { link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), TOAST_MS)
    } catch {
      // clipboard blocked: the link is selectable text
    }
  }

  return (
    <Sheet label={t('lobby.invite')} onClose={onClose}>
      <div className="center">
        <p className="muted">{t('lobby.invite')}</p>
        <QrCode text={link} />
        <p className="wrap link">{link}</p>
        <button type="button" className="btn" onClick={copy}>{t('lobby.copy')}</button>
      </div>
      <Toast text={copied ? t('lobby.copied') : ''} />
    </Sheet>
  )
}
