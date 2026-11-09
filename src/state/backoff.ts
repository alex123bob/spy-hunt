const DELAYS = [1000, 2000, 4000, 8000, 15000]

export function reloadDelay(failures: number): number {
  return DELAYS[Math.min(Math.max(failures, 0), DELAYS.length - 1)]
}
