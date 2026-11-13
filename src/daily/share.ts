import QRCode from 'qrcode'
import { t } from '../i18n'
import { rankByIndex, rankTitleKey } from '../game/rank'

export interface ShareInput {
  number: number
  tries: number
  solved: boolean
  elapsedMs: number
  wordCorrect: boolean | null
  streak: number
  url: string
  rankIndex?: number
}

export interface ShareTile {
  label: string
  value: string
  color: '--sun' | '--sky' | '--pink'
}

export interface ShareCardModel {
  title: string
  puzzle: string
  solved: boolean
  verdict: string
  mascot: string
  hero: string
  rankTitle: string
  tiles: ShareTile[]
  badge: string | null
  scanHint: string
  url: string
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Pure content model for the share card and text — everything user-visible, localized. */
export function shareCardModel(r: ShareInput): ShareCardModel {
  const time = clock(r.elapsedMs)
  // a first-try find, or nailing the spy's word, earns a little ribbon
  const badge = r.solved && r.tries === 1
    ? t('share.firstTry')
    : r.solved && r.wordCorrect === true
      ? t('share.wordNailed')
      : null
  return {
    title: t('share.title'),
    puzzle: t('share.puzzle', { n: r.number }),
    solved: r.solved,
    verdict: r.solved ? t('share.found') : t('share.missed'),
    hero: rankByIndex(r.rankIndex ?? 0).hero,
    rankTitle: t(rankTitleKey(r.rankIndex ?? 0)),
    mascot: r.solved ? '🕵️' : '🫥',
    tiles: [
      { label: t('share.time'), value: time, color: '--sky' },
      { label: t('share.tries'), value: String(r.tries), color: '--pink' },
      { label: t('share.streak'), value: `${r.streak}`, color: '--sun' },
    ],
    badge,
    scanHint: t('share.scanToPlay'),
    url: r.url,
  }
}

/** Plain, readable, localized fallback text (for clipboard or share targets that take no image). */
export function shareText(r: ShareInput): string {
  const key = r.solved ? 'share.textFound' : 'share.textMissed'
  return `${t(key, { n: r.number, time: clock(r.elapsedMs), streak: r.streak })}\n${r.url}`
}

const token = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const TOKEN_FALLBACK: Record<string, string> = {
  '--cream': '#f6ecd9',
  '--paper': '#fffaf0',
  '--ink': '#1d3b33',
  '--sun': '#f6c445',
  '--sky': '#8fd3e8',
  '--pink': '#f7a8b8',
  '--mint': '#9fe0b5',
  '--tomato': '#e5533d',
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/**
 * Draw the 1080×1080 cartoon share card onto `canvas`. Pure drawing from the model;
 * `qr` is an optional pre-rendered QR image. Safe to call only in a browser.
 */
export async function drawShareCard(canvas: HTMLCanvasElement, r: ShareInput): Promise<void> {
  const S = 1080
  canvas.width = S
  canvas.height = S
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    // environments without canvas (e.g. jsdom) — nothing to draw
  }
  if (!ctx) return
  const m = shareCardModel(r)
  const c = (name: string) => token(name, TOKEN_FALLBACK[name] ?? '#000')
  const ink = c('--ink')
  const font = (px: number, weight = 700) => `${weight} ${px}px 'Fredoka', 'PingFang SC', system-ui, sans-serif`

  // backdrop: cream with the app's polka dots
  ctx.fillStyle = c('--cream')
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = 'rgba(29,59,51,0.08)'
  for (let y = 36; y < S; y += 54) for (let x = 36; x < S; x += 54) {
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill()
  }

  // main card
  const pad = 70
  ctx.save()
  ctx.translate(S / 2, S / 2)
  ctx.rotate(-0.012)
  ctx.translate(-S / 2, -S / 2)
  ctx.fillStyle = ink
  rounded(ctx, pad + 10, pad + 14, S - 2 * pad, S - 2 * pad, 48); ctx.fill() // shadow
  ctx.fillStyle = c('--paper')
  ctx.lineWidth = 10
  ctx.strokeStyle = ink
  rounded(ctx, pad, pad, S - 2 * pad, S - 2 * pad, 48); ctx.fill(); ctx.stroke()
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // header
  ctx.fillStyle = ink
  ctx.font = font(78)
  ctx.fillText(`🕵️ ${m.title}`, S / 2, 210)
  ctx.font = font(40, 600)
  ctx.fillStyle = c('--tomato')
  ctx.fillText(m.puzzle.toUpperCase(), S / 2, 278)

  // hero + rank title band
  const hW = 520, hH = 70, hX = (S - hW) / 2, hY = 308
  ctx.fillStyle = ink
  rounded(ctx, hX + 5, hY + 6, hW, hH, hH / 2); ctx.fill()
  ctx.fillStyle = c('--sun'); ctx.lineWidth = 6; ctx.strokeStyle = ink
  rounded(ctx, hX, hY, hW, hH, hH / 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = ink
  ctx.font = font(38)
  ctx.fillText(`${m.hero} ${m.rankTitle}`, S / 2, hY + hH / 2 + 3)

  // verdict pill
  const vW = 620, vH = 104, vX = (S - vW) / 2, vY = 404
  ctx.fillStyle = ink
  rounded(ctx, vX + 7, vY + 9, vW, vH, vH / 2); ctx.fill()
  ctx.fillStyle = m.solved ? c('--mint') : c('--pink')
  ctx.lineWidth = 8; ctx.strokeStyle = ink
  rounded(ctx, vX, vY, vW, vH, vH / 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = ink
  ctx.font = font(62)
  ctx.fillText(`${m.mascot} ${m.verdict}`, S / 2, vY + vH / 2 + 4)

  // badge ribbon (optional)
  let statY = 580
  if (m.badge) {
    ctx.save()
    ctx.translate(S / 2, 540)
    ctx.rotate(-0.04)
    ctx.font = font(34, 600)
    const bw = ctx.measureText(m.badge).width + 60
    ctx.fillStyle = c('--sun'); ctx.lineWidth = 6; ctx.strokeStyle = ink
    rounded(ctx, -bw / 2, -28, bw, 56, 16); ctx.fill(); ctx.stroke()
    ctx.fillStyle = ink
    ctx.fillText(m.badge, 0, 2)
    ctx.restore()
    statY = 622
  }

  // three stat tiles
  const gap = 28, tW = (620 - 2 * gap) / 3, tH = 130, tX0 = (S - 620) / 2
  m.tiles.forEach((tile, i) => {
    const x = tX0 + i * (tW + gap)
    ctx.fillStyle = ink
    rounded(ctx, x + 5, statY + 6, tW, tH, 22); ctx.fill()
    ctx.fillStyle = c(tile.color); ctx.lineWidth = 6; ctx.strokeStyle = ink
    rounded(ctx, x, statY, tW, tH, 22); ctx.fill(); ctx.stroke()
    ctx.fillStyle = ink
    ctx.font = font(26, 600)
    ctx.fillText(tile.label, x + tW / 2, statY + 38)
    ctx.font = font(58)
    ctx.fillText(tile.value, x + tW / 2, statY + 90)
  })

  // QR + hint at the bottom
  const qrSize = 190, qrY = S - pad - qrSize - 46, qrX = (S - qrSize) / 2
  try {
    const dataUrl = await QRCode.toDataURL(m.url, { margin: 1, width: qrSize * 2, color: { dark: '#1d3b33', light: '#fffaf0' } })
    const img = await loadImage(dataUrl)
    ctx.fillStyle = c('--paper'); ctx.lineWidth = 6; ctx.strokeStyle = ink
    rounded(ctx, qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 18); ctx.fill(); ctx.stroke()
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize)
  } catch {
    // no QR: the link below still carries the invite
  }
  ctx.fillStyle = c('--ink')
  ctx.font = font(28, 600)
  ctx.fillText(m.scanHint, S / 2, S - pad - 8)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

export type ShareOutcome = 'shared' | 'copied' | 'failed'

const isCancel = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'

/** Generic text share: native share sheet, else clipboard. Used across result screens. */
export async function shareResult(text: string): Promise<ShareOutcome> {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text })
      return 'shared'
    }
  } catch {
    // cancelled or unsupported: try the clipboard
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/** Build the PNG card file, or null if canvas/image isn't available. */
async function cardFile(r: ShareInput): Promise<File | null> {
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    await drawShareCard(canvas, r)
    const blob = await canvasToBlob(canvas)
    return blob ? new File([blob], `spy-hunter-${r.number}.png`, { type: 'image/png' }) : null
  } catch {
    return null
  }
}

/**
 * Share the daily result. Prefers a cartoon PNG card via the native share sheet; falls back to
 * sharing/copying the plain text so it always does something useful. A user-cancelled native
 * share returns 'failed' and does not then paste to the clipboard.
 */
export async function shareDailyResult(r: ShareInput): Promise<ShareOutcome> {
  const text = shareText(r)
  const nav = typeof navigator !== 'undefined' ? navigator : undefined

  if (nav?.share) {
    const file = await cardFile(r)
    const payload = file && (!nav.canShare || nav.canShare({ files: [file] }))
      ? { files: [file], text }
      : { text }
    try {
      await nav.share(payload)
      return 'shared'
    } catch (e) {
      if (isCancel(e)) return 'failed' // user dismissed the sheet; don't surprise them with a copy
      // otherwise fall through to the clipboard
    }
  }

  try {
    await nav?.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
