import { openRoomStream, parseSse } from './stream'
import type { ServerEvent } from './types'

async function* gen(parts: string[]) {
  for (const p of parts) yield p
}
async function collect(parts: string[]) {
  const out: ServerEvent[] = []
  for await (const e of parseSse(gen(parts))) out.push(e)
  return out
}

test('an event split across two chunks parses once', async () => {
  const out = await collect(['id: 5\nevent: stat', 'ement\ndata: {"a":1}\n', '\n'])
  expect(out).toEqual([{ id: '5', event: 'statement', data: { a: 1 } }])
})

test('comments are skipped and multi-line data is joined', async () => {
  const out = await collect([': ping\n\nid: 1\nevent: x\ndata: line1\ndata: line2\n\n'])
  expect(out).toHaveLength(1)
  expect(out[0].data).toBe('line1\nline2')
})

test('CRLF framing works', async () => {
  const out = await collect(['id: 2\r\nevent: a\r\ndata: 1\r\n\r\n'])
  expect(out).toEqual([{ id: '2', event: 'a', data: 1 }])
})

test('after 3 failed connects status becomes polling', async () => {
  const statuses: string[] = []
  const fetchImpl = vi.fn().mockRejectedValue(new TypeError('down'))
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('down'))
  let n = 0
  const s = openRoomStream('ABCD', () => {}, (st) => statuses.push(st), {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {
      if (++n > 6) await new Promise((r) => setTimeout(r, 5))
    },
    pollMs: 1,
  })
  await vi.waitFor(() => expect(statuses).toContain('polling'))
  s.close()
  expect(statuses.indexOf('polling')).toBeGreaterThan(statuses.indexOf('reconnecting'))
  expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(3)
  vi.restoreAllMocks()
})

test('resume sends after=<last id>', async () => {
  const calls: string[] = []
  let first = true
  const fetchImpl = vi.fn(async (url: string) => {
    calls.push(url)
    if (first) {
      first = false
      const body = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('id: 7\nevent: turn\ndata: {}\n\n'))
          c.close()
        },
      })
      return new Response(body, { status: 200 })
    }
    return new Promise<Response>(() => {})
  })
  const got: ServerEvent[] = []
  const s = openRoomStream('ABCD', (e) => got.push(e), () => {}, {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {},
  })
  await vi.waitFor(() => expect(calls.length).toBe(2))
  s.close()
  expect(got).toHaveLength(1)
  expect(calls[1]).toContain('after=7')
})
