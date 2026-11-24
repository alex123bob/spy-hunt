import { useEffect, useRef } from 'react'
import { downloadCard, drawCard, shareCard, type ShareCardModel } from '../daily/share'
import { Sheet } from './Sheet'

export interface SharePreviewSheetProps {
  model: ShareCardModel
  label: string
  sub: string
  shareText: string
  filename: string
  shareLabel: string
  saveLabel: string
  onClose: () => void
  onOutcome: (toastText: string) => void
  sharedText: string
  copiedText: string
  failedText: string
  savedText: string
}

/** Preview the share card before acting — Share (native sheet/clipboard) or Save image (direct download). */
export function SharePreviewSheet(props: SharePreviewSheetProps) {
  const { model, label, sub, shareText, filename, shareLabel, saveLabel, onClose, onOutcome } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) void drawCard(canvasRef.current, model)
  }, [model])

  const doShare = async () => {
    const r = await shareCard({ model, text: shareText, filename })
    const text = r === 'cancelled' ? '' : r === 'shared' ? props.sharedText : r === 'copied' ? props.copiedText : props.failedText
    onOutcome(text)
    onClose()
  }

  const doSave = async () => {
    const ok = await downloadCard(model, filename)
    onOutcome(ok ? props.savedText : props.failedText)
    onClose()
  }

  return (
    <Sheet label={label} onClose={onClose}>
      <h2>{label}</h2>
      <p className="muted">{sub}</p>
      <canvas ref={canvasRef} className="share-card" role="img" aria-label={label} />
      <button type="button" className="btn primary" onClick={() => void doShare()}>{shareLabel}</button>
      <button type="button" className="btn secondary" onClick={() => void doSave()}>{saveLabel}</button>
    </Sheet>
  )
}
