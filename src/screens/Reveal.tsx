import type { Snapshot } from '../api/types'

export function Reveal({ state }: { state: Snapshot }) {
  return <main className="screen" data-testid="screen-Reveal">{state.code}</main>
}
