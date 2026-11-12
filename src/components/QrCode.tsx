import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QrCode({ text }: { text: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''))
    return () => {
      alive = false
    }
  }, [text])
  return <div className="qr card" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />
}
