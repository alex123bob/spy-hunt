import { API_BASE, authHeaders, request } from './client'
import type { ServerEvent, Snapshot } from './types'

export async function* parseSse(chunks: AsyncIterable<string>): AsyncGenerator<ServerEvent> {
  let buf = ''
  for await (const chunk of chunks) {
    buf += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const ev = parseBlock(block)
      if (ev) yield ev
    }
  }
}

function parseBlock(block: string): ServerEvent | null {
  let id: string | undefined
  let event = 'message'
  const data: string[] = []
  let any = false
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const c = line.indexOf(':')
    const field = c < 0 ? line : line.slice(0, c)
    let value = c < 0 ? '' : line.slice(c + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'id') id = value
    else if (field === 'event') event = value
    else if (field === 'data') data.push(value)
    else continue
    any = true
  }
  if (!any || data.length === 0) return null
  const raw = data.join('\n')
  let parsed: unknown = raw
  try {
    parsed = JSON.parse(raw)
  } catch {
    // keep the raw string
  }
  return { id, event, data: parsed }
}

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'polling' | 'failed'

export interface StreamOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  idleMs?: number
  backoffMs?: number[]
  after?: number
}

const BACKOFF = [1000, 2000, 4000, 8000, 15000]

export function openRoomStream(
  code: string,
  onEvent: (e: ServerEvent) => void,
  onStatus: (s: StreamStatus) => void,
  opts: StreamOptions = {},
): { close(): void; reconnectNow(): void } {
  const doFetch = opts.fetchImpl ?? ((i: RequestInfo | URL, init?: RequestInit) => fetch(i, init))
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const pollMs = opts.pollMs ?? 2000
  const idleMs = opts.idleMs ?? 40000
  const backoff = opts.backoffMs ?? BACKOFF

  let closed = false
  let lastId: string | undefined = opts.after !== undefined ? String(opts.after) : undefined
  let failures = 0
  let ctrl: AbortController | null = null
  let polling = false
  let status: StreamStatus | null = null

  const setStatus = (s: StreamStatus) => {
    if (s !== status) {
      status = s
      onStatus(s)
    }
  }

  const deliver = (e: ServerEvent) => {
    if (e.id !== undefined && e.id !== '') lastId = e.id
    onEvent(e)
  }

  async function pollLoop() {
    if (polling) return
    polling = true
    while (!closed && failures >= 3) {
      try {
        const snap = await request<Snapshot>('GET', `/rooms/${encodeURIComponent(code)}`)
        if (closed) break
        deliver({ id: String(snap.last_seq), event: 'state', data: snap })
      } catch {
        // keep polling; the stream loop decides when to give up
      }
      await sleep(pollMs)
    }
    polling = false
  }

  async function connectOnce(): Promise<'ended' | 'fatal'> {
    ctrl = new AbortController()
    const my = ctrl
    const qs = lastId !== undefined ? `?after=${encodeURIComponent(lastId)}` : '?after=0'
    const headers: Record<string, string> = { ...authHeaders(), Accept: 'text/event-stream' }
    if (lastId !== undefined) headers['Last-Event-ID'] = lastId
    const res = await doFetch(`${API_BASE}/rooms/${encodeURIComponent(code)}/events${qs}`, {
      headers,
      signal: my.signal,
    })
    if (res.status === 401 || res.status === 403 || res.status === 404) return 'fatal'
    if (!res.ok || !res.body) throw new Error(`stream http ${res.status}`)
    failures = 0
    setStatus('open')
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let idle: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => my.abort(), idleMs)
    }
    async function* chunks() {
      arm()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) return
          arm()
          yield dec.decode(value, { stream: true })
        }
      } finally {
        if (idle) clearTimeout(idle)
      }
    }
    try {
      for await (const e of parseSse(chunks())) {
        if (closed) break
        deliver(e)
      }
    } catch (err) {
      if (!closed && !my.signal.aborted) throw err
    }
    return 'ended'
  }

  async function run() {
    setStatus('connecting')
    while (!closed) {
      try {
        const r = await connectOnce()
        if (r === 'fatal') {
          setStatus('failed')
          return
        }
        failures = 0 // a stream that opened then ended is not a failed connect
      } catch {
        if (closed) return
        failures += 1
      }
      if (closed) return
      if (failures >= 3) {
        setStatus('polling')
        void pollLoop()
      } else {
        setStatus('reconnecting')
      }
      await sleep(backoff[Math.min(Math.max(failures - 1, 0), backoff.length - 1)] ?? 15000)
    }
  }

  void run()
  return {
    close() {
      closed = true
      ctrl?.abort()
    },
    reconnectNow() {
      ctrl?.abort()
    },
  }
}
