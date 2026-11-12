/** Token drops, then wobble, then stamp (+ confetti). Total is always <= 2100ms. */
export function revealDelays(voteCount: number): number[] {
  const each = Math.min(220, Math.floor(1200 / Math.max(voteCount, 1)))
  return [...Array.from({ length: voteCount }, () => each), 400, 500]
}
