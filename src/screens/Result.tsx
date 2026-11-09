import type { Snapshot } from '../api/types'

export function Result({ state }: { state: Snapshot }) {
  return <main className="screen" data-testid="screen-Result">{state.code}</main>
}
