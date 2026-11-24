# Share Preview Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Landing "Share" pill's and Lobby "Invite" pill's instant fire-and-forget share with a preview dialog that shows the actual card image before sharing, offering both "Share" (native share sheet / clipboard fallback, unchanged) and a new "Save image" (direct PNG download). Add the same "Save image" capability to the Result screen next to its existing inline preview and Share button, without wrapping Result in a dialog.

**Architecture:** Add one new pure function, `downloadCard(model, filename)`, next to the existing `drawCard`/`shareCard` in `src/daily/share.ts` — it draws the model to an off-screen canvas (reusing `drawCard`), converts it to a PNG blob, and triggers a browser download via a temporary `<a download>` element + `URL.createObjectURL`. Add one new reusable component, `SharePreviewSheet`, built on the existing `Sheet` component, that draws a model to a visible canvas (reusing `drawCard`) and renders "Share" and "Save image" buttons. Wire it into `Landing.tsx` (replacing the instant `promoShare`) and `Lobby.tsx` (replacing the instant `inviteShare`, and folding in the existing QR-only `ShareSheet` flow — see Task 4's note on consolidating entry points). Add a standalone "Save image" button to `Result.tsx` next to its existing Share button, calling `downloadCard` directly — no dialog, since Result already shows the card inline.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library. No new dependencies — reuses `qrcode`, canvas drawing, and the existing `Sheet` component.

**Spec:** This plan's design doc is the brainstorming conversation and the approved HTML mockup (`/tmp/spy-hunt-mockup/mockup.html`, built and screenshotted during brainstorming, approved by the user as "good to go"). No separate written spec file; decisions are recorded here.

## Global Constraints

- No new dependencies.
- `downloadCard(model: ShareCardModel, filename: string): Promise<boolean>` lives in `src/daily/share.ts`, next to `drawCard`/`shareCard`/`cardFile`. Returns `false` (never throws) when canvas/document/blob isn't available, mirroring `cardFile`'s existing no-op-safe pattern.
- Download mechanics: `canvas.toBlob('image/png')` → `URL.createObjectURL(blob)` → a temporary `<a href=url download=filename>` appended to `document.body`, `.click()`-ed, then `.remove()`-ed → `URL.revokeObjectURL(url)`. This exact sequence is pre-verified to work and to be fully mockable in jsdom via `vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')`, `vi.spyOn(URL, 'createObjectURL'/'revokeObjectURL')`, and `vi.spyOn(HTMLAnchorElement.prototype, 'click')`.
- `SharePreviewSheet` lives in `src/components/SharePreviewSheet.tsx`, built on the existing `Sheet` component (`src/components/Sheet.tsx`) exactly as `ShareSheet.tsx` and `AlreadyInRoomSheet.tsx` already do — same `Sheet` props (`label`, `onClose`), same dialog semantics (focus trap, Escape-to-close, backdrop click already handled by `Sheet`).
- `SharePreviewSheet` draws the card on mount into a visible `<canvas className="share-card">` (the same class Result.tsx already uses — reuse that CSS rule in `src/styles/pages.css:5`, do not add a new one), via the existing `drawCard(canvas, model)`.
- `SharePreviewSheet`'s props are finalized in Task 3 (`SharePreviewSheetProps`) — it takes the dialog title/subtitle and all four possible toast strings (`sharedText`, `copiedText`, `failedText`, `savedText`) as plain resolved strings from the caller, not i18n keys, so the component itself imports no i18n and stays screen-agnostic. On either button it calls `shareCard`/`downloadCard`, resolves the right string, then calls `onOutcome(text)` and `onClose()`. This keeps each screen's existing `{ text, n }` toast-state pattern (`Landing.tsx`, `Lobby.tsx`, `Result.tsx` all already have one) untouched.
- Button order inside the dialog, top to bottom: card preview, then **Share** (`btn primary`), then **Save image** (`btn secondary`) — matching the approved mockup exactly.
- i18n: add `landing.saveImage` / `lobby.saveImage` / `result.saveImage` (button label "Save image" / "保存图片") and `landing.imageSaved` / `lobby.imageSaved` / `result.imageSaved` (toast text "Image saved!" / "图片已保存！") to both `en.json` and `zh-Hans.json`, matching the existing per-screen key style (`landing.shared`, `lobby.shared`, `result.shared`, etc.). Also add one shared key, `share.dialogSub`, for the "Here's what friends will see." subtitle text used by both Landing's and Lobby's dialogs (see Task 2). Landing's dialog title is a new key, `landing.shareDialogTitle` ("Share Spy Hunt" / "分享谁是卧底"); Lobby's dialog title reuses the existing `lobby.invite` key ("Invite friends" / "邀请好友") — no new key needed there.
- Keep all existing `shareText`/model-building logic in each screen (`promoCardModel`, `lobbyInviteCardModel`, `roomCardModel`) exactly as-is — the dialog is purely a presentation wrapper around the existing share pipeline, not a new data flow.

## Review Focus

- **`downloadCard` when canvas/document is unavailable (SSR-like or jsdom without canvas support):** must resolve `false`, never throw — mirrors `cardFile`'s existing try/catch-to-null pattern. Test: call `downloadCard` with `document` stubbed undefined (same pattern as `share.test.ts`'s `noCanvas()` helper) and assert it resolves `false`.
- **`downloadCard` when `canvas.toBlob` yields `null`** (a real browser can do this under memory pressure or a tainted canvas): must resolve `false`, not throw on `new File([null, ...])`. Test: stub `toBlob` to call back with `null`, assert `downloadCard` resolves `false` and never calls `URL.createObjectURL`.
- **Dialog closes and cleans up the object URL after Save image, even though the user is immediately looking at a closed dialog with no persisted download state:** test that `URL.revokeObjectURL` is called with the same URL `createObjectURL` returned, so a that a user opening the dialog repeatedly doesn't leak blob URLs.
- **Opening the dialog twice in a row (e.g. Landing's Share pill clicked, closed, clicked again) must redraw the canvas each time**, not show a stale/blank canvas from a previous open — `SharePreviewSheet` must call `drawCard` in a `useEffect` keyed so it re-runs on every mount (the dialog is conditionally rendered, so mount = open; no stale-canvas risk from React's side, but confirm the canvas ref drawing happens before paint-visible state, matching `Result.tsx`'s existing `useEffect` pattern).
- **Clicking Share inside the dialog when the user cancels the native share sheet:** must close the dialog and show no toast (not an error toast) — same `'cancelled'` semantics `shareToast` already encodes; test that `onOutcome` receives `''` and the dialog still closes.

---

## Task 1: `downloadCard` in `src/daily/share.ts`

**Files:**
- Modify: `src/daily/share.ts`
- Test: `src/daily/share.test.ts`

**Interfaces:**
- Consumes: `ShareCardModel`, `drawCard` (both already defined in this file).
- Produces: `downloadCard(model: ShareCardModel, filename: string): Promise<boolean>` — used by Task 2 (`SharePreviewSheet`) and Task 5 (`Result.tsx`'s standalone Save image button).

- [ ] **Step 1: Write the failing tests**

Add to `src/daily/share.test.ts`, inside a new `describe('downloadCard', ...)` block (place after the existing `describe('shareResult', ...)` block). Reuse the existing `base` fixture and `shareCardModel(base)` for a model:

```ts
describe('downloadCard', () => {
  afterEach(() => vi.restoreAllMocks())

  test('returns false when no document is available', async () => {
    vi.stubGlobal('document', undefined)
    expect(await downloadCard(shareCardModel(base), 'x.png')).toBe(false)
    vi.unstubAllGlobals()
  })

  test('returns false when toBlob yields null, without creating an object URL', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(null))
    const createSpy = vi.spyOn(URL, 'createObjectURL')
    expect(await downloadCard(shareCardModel(base), 'x.png')).toBe(false)
    expect(createSpy).not.toHaveBeenCalled()
  })

  test('creates an object URL, clicks a download anchor with the filename, then revokes it', async () => {
    const fakeBlob = new Blob(['fake'], { type: 'image/png' })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(fakeBlob))
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const ok = await downloadCard(shareCardModel(base), 'spy-hunt.png')

    expect(ok).toBe(true)
    expect(createSpy).toHaveBeenCalledWith(fakeBlob)
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake-url')
  })
})
```

Add `downloadCard` to this test file's top import line (`import { downloadCard, shareCardModel, shareDailyResult, shareText } from './share'`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/daily/share.test.ts`
Expected: FAIL — `downloadCard is not exported` / `is not a function`.

- [ ] **Step 3: Implement `downloadCard` in `src/daily/share.ts`**

Add below the existing `cardFile` function (which already shows the canvas + `drawCard` + `canvasToBlob` pattern to follow):

```ts
/** Draw `model` and trigger a browser download of the PNG; never throws, resolves false if it can't. */
export async function downloadCard(model: ShareCardModel, filename: string): Promise<boolean> {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    await drawCard(canvas, model)
    const blob = await canvasToBlob(canvas)
    if (!blob) return false
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run src/daily/share.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/daily/share.ts src/daily/share.test.ts
git commit -m "feat: add downloadCard for direct PNG download of a share card"
```

---

## Task 2: i18n strings for the dialog

**Files:**
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-Hans.json`
- Test: `src/i18n/i18n.test.ts` (read-only check — confirm existing symmetry test still passes; see Step 2)

**Interfaces:**
- Produces: i18n keys consumed by Task 3 (`SharePreviewSheet`), Task 4 (`Landing.tsx`, `Lobby.tsx`), and Task 5 (`Result.tsx`).

- [ ] **Step 1: Add keys to `src/i18n/en.json`**

Add near the existing `share.*` block (after `share.scanToRoom`, around line 161):
```
"share.dialogSub": "Here's what friends will see.",
```

Add near the existing `landing.*` block (after `landing.shareFailed`, around line 18):
```
"landing.shareDialogTitle": "Share Spy Hunt",
"landing.saveImage": "Save image",
"landing.imageSaved": "Image saved!",
```

Add near the existing `lobby.*` block (after `lobby.shareFailed`, around line 45):
```
"lobby.saveImage": "Save image",
"lobby.imageSaved": "Image saved!",
```

Add near the existing `result.*` block (after `result.shareFailed`, around line 184):
```
"result.saveImage": "Save image",
"result.imageSaved": "Image saved!",
```

- [ ] **Step 2: Add the matching keys to `src/i18n/zh-Hans.json`**, same locations, translated naturally to match the existing tone of each screen's strings:
```
"share.dialogSub": "好友将会看到这样的内容。",
"landing.shareDialogTitle": "分享谁是卧底",
"landing.saveImage": "保存图片",
"landing.imageSaved": "图片已保存！",
"lobby.saveImage": "保存图片",
"lobby.imageSaved": "图片已保存！",
"result.saveImage": "保存图片",
"result.imageSaved": "图片已保存！",
```

- [ ] **Step 3: Run the i18n symmetry test**

Run: `yarn vitest run src/i18n/i18n.test.ts`
Expected: PASS (confirms `en.json` and `zh-Hans.json` keys stay in sync — if this test doesn't already check key-set symmetry, this step is a no-op confirmation, not a new test; do not add a new test here).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/en.json src/i18n/zh-Hans.json
git commit -m "feat: add i18n strings for the share preview dialog and Save image"
```

---

## Task 3: `SharePreviewSheet` component

**Files:**
- Create: `src/components/SharePreviewSheet.tsx`
- Test: `src/components/SharePreviewSheet.test.tsx`

**Interfaces:**
- Consumes: `Sheet` from `./Sheet` (props: `label: string`, `onClose: () => void`, `children`), `drawCard`, `shareCard`, `downloadCard`, `ShareCardModel` from `../daily/share`, `shareToast`-equivalent outcome mapping is NOT used here (the dialog takes pre-resolved strings via `onOutcome`, decoupling it from any one screen's i18n keys), `t` from `../i18n`.
- Produces: `SharePreviewSheet(props: SharePreviewSheetProps): JSX.Element` — used by Task 4 (`Landing.tsx`, `Lobby.tsx`). Exact prop list below.

Prop list (finalize exactly this shape — simpler than the Global Constraints sketch, since passing resolved strings avoids a second i18n-key indirection layer the caller would otherwise have to maintain):

```ts
export interface SharePreviewSheetProps {
  model: ShareCardModel
  label: string        // dialog aria-label / title, e.g. t('landing.shareDialogTitle')
  sub: string           // subtitle under the title, e.g. t('share.dialogSub')
  shareText: string     // text payload passed to shareCard
  filename: string      // PNG filename for both share and download
  shareLabel: string    // "Share" button text
  saveLabel: string      // "Save image" button text
  onClose: () => void
  onOutcome: (toastText: string) => void  // called with the resolved toast string ('' = no toast) after Share or Save
  sharedText: string    // toast text when shareCard resolves 'shared'
  copiedText: string    // toast text when shareCard resolves 'copied'
  failedText: string    // toast text when shareCard resolves 'failed' (also used for a failed Save image)
  savedText: string     // toast text when downloadCard resolves true
}
```

- [ ] **Step 1: Write the failing tests**

Create `src/components/SharePreviewSheet.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SharePreviewSheet } from './SharePreviewSheet'
import { drawCard, shareCard, downloadCard } from '../daily/share'
import type { ShareCardModel } from '../daily/share'

vi.mock('../daily/share', () => ({ drawCard: vi.fn(), shareCard: vi.fn(), downloadCard: vi.fn() }))

const model: ShareCardModel = {
  title: 'Spy Hunt', puzzle: 'tagline', solved: true, verdict: 'Trust nobody!',
  mascot: '🕵️', hero: '', rankTitle: '', tiles: [], badge: null, scanHint: 'Scan to play', url: 'https://x/',
}

const props = {
  model, label: 'Share Spy Hunt', sub: "Here's what friends will see.",
  shareText: 'share me\nhttps://x/', filename: 'spy-hunt.png',
  shareLabel: 'Share', saveLabel: 'Save image',
  onClose: vi.fn(), onOutcome: vi.fn(),
  sharedText: 'Shared', copiedText: 'Copied!', failedText: 'Could not share.', savedText: 'Image saved!',
}

beforeEach(() => {
  vi.mocked(drawCard).mockReset().mockResolvedValue(undefined)
  vi.mocked(shareCard).mockReset()
  vi.mocked(downloadCard).mockReset()
  props.onClose = vi.fn()
  props.onOutcome = vi.fn()
})

test('draws the model onto a visible canvas on open', async () => {
  render(<SharePreviewSheet {...props} />)
  await waitFor(() => expect(drawCard).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), model))
})

test('shows the dialog title, subtitle, and both action buttons', () => {
  render(<SharePreviewSheet {...props} />)
  expect(screen.getByRole('dialog', { name: 'Share Spy Hunt' })).toBeInTheDocument()
  expect(screen.getByText("Here's what friends will see.")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save image' })).toBeInTheDocument()
})

test('Share calls shareCard with the model/text/filename, reports the toast, and closes', async () => {
  vi.mocked(shareCard).mockResolvedValue('copied')
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalledWith({ model, text: props.shareText, filename: props.filename }))
  expect(props.onOutcome).toHaveBeenCalledWith('Copied!')
  expect(props.onClose).toHaveBeenCalled()
})

test('a cancelled native share closes the dialog with no toast', async () => {
  vi.mocked(shareCard).mockResolvedValue('cancelled')
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalled())
  expect(props.onOutcome).toHaveBeenCalledWith('')
  expect(props.onClose).toHaveBeenCalled()
})

test('a failed share reports the failure toast', async () => {
  vi.mocked(shareCard).mockResolvedValue('failed')
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(props.onOutcome).toHaveBeenCalledWith('Could not share.'))
})

test('Save image calls downloadCard with the model/filename, reports saved, and closes', async () => {
  vi.mocked(downloadCard).mockResolvedValue(true)
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save image' }))
  await waitFor(() => expect(downloadCard).toHaveBeenCalledWith(model, props.filename))
  expect(props.onOutcome).toHaveBeenCalledWith('Image saved!')
  expect(props.onClose).toHaveBeenCalled()
})

test('a failed Save image reports the failure toast', async () => {
  vi.mocked(downloadCard).mockResolvedValue(false)
  render(<SharePreviewSheet {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save image' }))
  await waitFor(() => expect(props.onOutcome).toHaveBeenCalledWith('Could not share.'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/components/SharePreviewSheet.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `SharePreviewSheet` in `src/components/SharePreviewSheet.tsx`**

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn vitest run src/components/SharePreviewSheet.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/SharePreviewSheet.tsx src/components/SharePreviewSheet.test.tsx
git commit -m "feat: add SharePreviewSheet dialog with Share and Save image actions"
```

---

## Task 4: Wire the dialog into Landing and Lobby

**Files:**
- Modify: `src/screens/Landing.tsx`
- Modify: `src/screens/Lobby.tsx`
- Modify: `src/screens/Landing.test.tsx`
- Modify: `src/screens/Lobby.test.tsx`

**Interfaces:**
- Consumes: `SharePreviewSheet` and its props (Task 3); `promoCardModel`, `lobbyInviteCardModel` (pre-existing, unchanged); `shareToast` is no longer called from these two screens for the dialog path (the dialog resolves its own toast text via the `sharedText`/`copiedText`/`failedText`/`savedText` props) — but note `shareToast` itself (`src/daily/shareToast.ts`) is untouched and still used by `Result.tsx` (Task 5).
- Produces: nothing consumed elsewhere.

**Landing.tsx changes:**

- [ ] **Step 1: Write the failing tests**

Replace the three existing share-related tests in `src/screens/Landing.test.tsx` (the ones added in the prior plan: `'clicking Share shares the promo card and toasts the outcome'`, `'cancelling the native share on Landing shows no toast'`, `'a failed share on Landing shows the failure toast'`) with dialog-aware versions. Update the `vi.mock('../daily/share', ...)` line to also stub `downloadCard` and `drawCard`:

```ts
vi.mock('../daily/share', () => ({ shareCard: vi.fn(), downloadCard: vi.fn(), drawCard: vi.fn() }))
```

New/replacement tests:

```ts
test('clicking Share opens a preview dialog showing the promo card', () => {
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(screen.getByRole('dialog', { name: 'Share Spy Hunt' })).toBeInTheDocument()
})

test('Share inside the dialog shares the promo card and toasts the outcome', async () => {
  vi.mocked(shareCard).mockResolvedValue('copied')
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalled())
  const arg = vi.mocked(shareCard).mock.calls[0][0]
  expect(arg.model.tiles).toEqual([])
  expect(arg.model.url).toBe(`${window.location.origin}/`)
  expect(arg.text).toContain(`${window.location.origin}/`)
  expect(await screen.findByText('Copied!')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('Save image inside the dialog downloads the card and toasts Image saved', async () => {
  vi.mocked(downloadCard).mockResolvedValue(true)
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save image' }))
  await waitFor(() => expect(downloadCard).toHaveBeenCalled())
  expect(await screen.findByText('Image saved!')).toBeInTheDocument()
})

test('cancelling the native share from the dialog shows no toast', async () => {
  vi.mocked(shareCard).mockResolvedValue('cancelled')
  renderLanding()
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Share' }))
  await waitFor(() => expect(shareCard).toHaveBeenCalled())
  await act(async () => {})
  expect(screen.queryByRole('status')).toBeNull()
})
```

Add `within` to the existing `@testing-library/react` import line, and add `downloadCard` to the `import { shareCard } from '../daily/share'` line (now `import { downloadCard, shareCard } from '../daily/share'`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/screens/Landing.test.tsx`
Expected: FAIL — no dialog opens yet (pill still calls `promoShare` directly).

- [ ] **Step 3: Rewrite `Landing.tsx`'s share wiring**

Remove the `promoShare` function and the direct `shareCard`/`shareToast` imports/calls; add dialog-open state and render `SharePreviewSheet` conditionally. Replace:

```ts
import { shareCard } from '../daily/share'
import { shareToast } from '../daily/shareToast'
import { promoCardModel } from '../game/lobbyShare'
```
with:
```ts
import { promoCardModel } from '../game/lobbyShare'
import { SharePreviewSheet } from '../components/SharePreviewSheet'
```

Replace the `shareState` state and `promoShare` function with:
```ts
const [shareState, setShareState] = useState({ text: '', n: 0 })
const [shareOpen, setShareOpen] = useState(false)
```

(keep `shareState`/`setShareState` — only remove `promoShare` and the old imports).

Replace the pill + old `<Toast>` JSX:
```tsx
<button type="button" className="pill" onClick={() => void promoShare()}>{t('landing.sharePill')}</button>
<Toast text={shareState.text} nonce={shareState.n} />
```
with:
```tsx
<button type="button" className="pill" onClick={() => setShareOpen(true)}>{t('landing.sharePill')}</button>
<Toast text={shareState.text} nonce={shareState.n} />
{shareOpen && (
  <SharePreviewSheet
    model={promoCardModel(`${window.location.origin}${import.meta.env.BASE_URL}`)}
    label={t('landing.shareDialogTitle')}
    sub={t('share.dialogSub')}
    shareText={`${t('landing.shareText')}\n${window.location.origin}${import.meta.env.BASE_URL}`}
    filename="spy-hunt.png"
    shareLabel={t('landing.sharePill')}
    saveLabel={t('landing.saveImage')}
    sharedText={t('landing.shared')}
    copiedText={t('landing.copied')}
    failedText={t('landing.shareFailed')}
    savedText={t('landing.imageSaved')}
    onClose={() => setShareOpen(false)}
    onOutcome={(text) => setShareState((s) => ({ text, n: s.n + 1 }))}
  />
)}
```

- [ ] **Step 4: Run Landing tests to verify they pass**

Run: `yarn vitest run src/screens/Landing.test.tsx`
Expected: PASS

**Lobby.tsx changes** (consolidating the Invite pill's dialog with the existing standalone QR popup — see note below):

- [ ] **Step 5: Write the failing tests**

In `src/screens/Lobby.test.tsx`, update the `vi.mock('../daily/share', ...)` line to also stub `downloadCard` and `drawCard`:
```ts
vi.mock('../daily/share', () => ({ shareCard: vi.fn(), downloadCard: vi.fn(), drawCard: vi.fn() }))
```
Add `downloadCard` and `drawCard` to the existing `import { shareCard } from '../daily/share'` line.

Replace the three existing Invite-related tests (`'clicking Invite shares the room invite card and toasts the outcome'`, `'Invite when the native share is cancelled or fails shows an error toast, no throw'`, `'cancelling the native share shows no toast at all'`) with dialog-aware versions, following the exact same pattern used for Landing above (open dialog by clicking "Invite", then click "Share" or "Save image" *inside* the dialog via `within(screen.getByRole('dialog'))`). Keep the existing QR-icon test (`'clicking the QR icon opens the ShareSheet with the invite link'`) as-is — the QR icon button and its `ShareSheet` popup are untouched; the dialog this task adds is reached only through the "Invite" pill, a separate entry point.

- [ ] **Step 6: Run tests to verify they fail**

Run: `yarn vitest run src/screens/Lobby.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Rewrite `Lobby.tsx`'s Invite wiring**

Same pattern as Landing: remove `inviteShare`, add `shareOpen` state, render `SharePreviewSheet` conditionally when the "Invite" pill is clicked. Import `SharePreviewSheet`; remove the `shareCard`/`shareToast` imports if no longer used directly in this file (keep them if the file still needs `ShareOutcome` or similar — check before removing). The QR icon button and its `ShareSheet` stay completely unchanged (separate state, separate popup).

```tsx
<button type="button" className="pill" onClick={() => setShareOpen(true)}>{t('lobby.invitePill')}</button>
<button type="button" className="pill" aria-label={t('lobby.qrCode')} onClick={() => setQrOpen(true)}><span aria-hidden>▦</span></button>
```
```tsx
{qrOpen && <ShareSheet link={link} onClose={() => setQrOpen(false)} />}
{shareOpen && (
  <SharePreviewSheet
    model={lobbyInviteCardModel(code, state.players.length, state.config.max_players, link)}
    label={t('lobby.invite')}
    sub={t('share.dialogSub')}
    shareText={`${t('lobby.shareText', { code })}\n${link}`}
    filename={`spy-hunt-room-${code}.png`}
    shareLabel={t('lobby.invitePill')}
    saveLabel={t('lobby.saveImage')}
    sharedText={t('lobby.shared')}
    copiedText={t('lobby.copied')}
    failedText={t('lobby.shareFailed')}
    savedText={t('lobby.imageSaved')}
    onClose={() => setShareOpen(false)}
    onOutcome={(text) => setShareState((s) => ({ text, n: s.n + 1 }))}
  />
)}
<Toast text={shareState.text} nonce={shareState.n} />
```

- [ ] **Step 8: Run Lobby tests to verify they pass**

Run: `yarn vitest run src/screens/Lobby.test.tsx`
Expected: PASS

- [ ] **Step 9: Run the full suite and typecheck**

Run: `yarn vitest run && yarn build`
Expected: PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add src/screens/Landing.tsx src/screens/Lobby.tsx src/screens/Landing.test.tsx src/screens/Lobby.test.tsx
git commit -m "feat: open a share preview dialog from Landing's Share and Lobby's Invite pills"
```

---

## Task 5: "Save image" on the Result screen

**Files:**
- Modify: `src/screens/Result.tsx`
- Modify: `src/screens/Result.test.tsx`

**Interfaces:**
- Consumes: `downloadCard` (Task 1), the existing `model()` builder and `shareState` already in `Result.tsx`.
- Produces: nothing consumed elsewhere — leaf UI, no dialog (Result already shows the card inline via its existing `<canvas className="share-card">`).

- [ ] **Step 1: Write the failing tests**

Add to `src/screens/Result.test.tsx`. Update the `vi.mock('../daily/share', ...)` line to also stub `downloadCard`:
```ts
vi.mock('../daily/share', () => ({ shareCard: vi.fn(), drawCard: vi.fn(), downloadCard: vi.fn() }))
```
Add `downloadCard` to the `import { shareCard } from '../daily/share'` line, and reset its mock in the existing `beforeEach` alongside `shareCard`'s reset (`vi.mocked(downloadCard).mockReset()`).

```ts
test('shows a Save image button next to Share', () => {
  view(finished())
  expect(screen.getByRole('button', { name: 'Save image' })).toBeInTheDocument()
})

test('Save image downloads the card and toasts Image saved', async () => {
  vi.mocked(downloadCard).mockResolvedValue(true)
  view(finished())
  fireEvent.click(screen.getByRole('button', { name: 'Save image' }))
  expect(await screen.findByText('Image saved!')).toBeInTheDocument()
  const [modelArg, filenameArg] = vi.mocked(downloadCard).mock.calls[0]
  expect(modelArg.verdict).toBe('We won!')
  expect(filenameArg).toMatch(/\.png$/)
})

test('a failed Save image shows the failure toast', async () => {
  vi.mocked(downloadCard).mockResolvedValue(false)
  view(finished())
  fireEvent.click(screen.getByRole('button', { name: 'Save image' }))
  expect(await screen.findByText('Could not share.')).toBeInTheDocument()
})

test('Save image is absent when the game ended with no winner', () => {
  view(finished({ winner: null }))
  expect(screen.queryByRole('button', { name: 'Save image' })).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn vitest run src/screens/Result.test.tsx`
Expected: FAIL — no "Save image" button exists yet.

- [ ] **Step 3: Implement the Save image button in `Result.tsx`**

Add `downloadCard` to the existing import line (`import { downloadCard, drawCard, shareCard } from '../daily/share'`).

Add a `saveImage` handler next to the existing `share` function:
```ts
const saveImage = async () => {
  if (!shareable) return
  const ok = await downloadCard(model(), `spy-hunt-${state.code}-${state.game_no}.png`)
  setShareState((s) => ({ text: ok ? t('result.imageSaved') : t('result.shareFailed'), n: s.n + 1 }))
}
```

Add the button next to the existing Share button (same `shareable &&` block):
```tsx
{shareable && (
  <>
    <canvas ref={canvasRef} className="share-card" data-testid="share-card" role="img" aria-label={t('result.title')} />
    <button type="button" className="btn" onClick={share}>{t('result.share')}</button>
    <button type="button" className="btn secondary" onClick={() => void saveImage()}>{t('result.saveImage')}</button>
    <Toast text={shareState.text} nonce={shareState.n} />
  </>
)}
```

- [ ] **Step 4: Run Result tests to verify they pass**

Run: `yarn vitest run src/screens/Result.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite and typecheck**

Run: `yarn vitest run && yarn build`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Result.tsx src/screens/Result.test.tsx
git commit -m "feat: add Save image button to the Result screen"
```

---

## Task 6: Manual verification in the running app

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `yarn dev`

- [ ] **Step 2: Landing — click Share, confirm the dialog opens showing the drawn card (title, tagline/verdict, QR, scan hint), with Share and Save image buttons**

- [ ] **Step 3: Click Save image in the Landing dialog; confirm a PNG downloads (browser's download bar/folder) and a "Image saved!" toast appears after the dialog closes**

- [ ] **Step 4: Click Share in the Landing dialog on a browser without `navigator.share` (desktop); confirm clipboard copy + "Copied!" toast, dialog closes**

- [ ] **Step 5: Create a room, open Lobby, click Invite; confirm the same dialog pattern shows the room-invite card (room code, player count tile, QR); confirm the separate QR icon button still opens the old `ShareSheet` popup (QR + link + copy), unchanged**

- [ ] **Step 6: Play a game to the Result screen; confirm the existing inline card preview is unchanged, and a new "Save image" button sits next to "Share", downloading the same PNG the inline canvas shows**

- [ ] **Step 7: Switch to Simplified Chinese; confirm dialog titles, subtitle, and both button labels are translated on Landing and Lobby, and the Result "Save image" button is translated**

No commit for this task — it's verification, not code.
