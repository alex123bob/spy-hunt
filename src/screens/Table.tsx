import type { Snapshot } from '../api/types'

export function Table({ state }: { state: Snapshot; offset?: number }) {
  return <main className="screen" data-testid="screen-Table">{state.code}</main>
}
