import { useEffect, useRef, useState } from 'react'
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

  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  // Callers build the model inline, so key the redraw on its content, not its identity.
  const modelKey = JSON.stringify(model)
  useEffect(() => {
    if (canvasRef.current) void drawCard(canvasRef.current, model)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey])

  const guarded = async (run: () => Promise<string>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      onOutcome(await run())
    } finally {
      onClose()
    }
  }

  const doShare = () => guarded(async () => {
    const r = await shareCard({ model, text: shareText, filename })
    return r === 'cancelled' ? '' : r === 'shared' ? props.sharedText : r === 'copied' ? props.copiedText : props.failedText
  })

  const doSave = () => guarded(async () => ((await downloadCard(model, filename)) ? props.savedText : props.failedText))

  return (
    <Sheet label={label} onClose={onClose}>
      <h2>{label}</h2>
      <p className="muted">{sub}</p>
      <canvas ref={canvasRef} className="share-card" role="img" aria-label={label} />
      <div className="share-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void doShare()}>{shareLabel}</button>
        <button type="button" className="btn secondary" disabled={busy} onClick={() => void doSave()}>{saveLabel}</button>
      </div>
    </Sheet>
  )
}
