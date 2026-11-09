import type { Snapshot } from '../api/types'

export function Vote({ state }: { state: Snapshot; offset?: number }) {
  return <main className="screen" data-testid="screen-Vote">{state.code}</main>
}
