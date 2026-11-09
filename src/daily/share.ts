export interface ShareInput {
  number: number
  tries: number
  solved: boolean
  elapsedMs: number
  wordCorrect: boolean | null
  streak: number
  url: string
}

function clock(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function shareText(r: ShareInput): string {
  const wrong = r.solved ? r.tries - 1 : r.tries
  const word = r.wordCorrect === null ? '' : r.wordCorrect ? ' ✅ word' : ' ❌ word'
  const streak = r.streak >= 1 ? `Streak ${r.streak} 🔥 ${r.url}` : `Streak 0 ${r.url}`
  return `Spy Hunter #${r.number} 🕵️\n${'🟥'.repeat(wrong)}${r.solved ? '🟩' : ''} ⏱ ${clock(r.elapsedMs)}${word}\n${streak}`
}

export async function shareResult(text: string): Promise<'shared' | 'copied' | 'failed'> {
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
