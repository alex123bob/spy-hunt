export interface VoteGroups {
  groups: { target: number; voters: number[] }[]
  abstained: number[]
}

export function groupVotes(votes: { voter: number; target: number | null }[]): VoteGroups {
  const byTarget = new Map<number, number[]>()
  const abstained: number[] = []
  for (const v of votes) {
    if (v.target === null) abstained.push(v.voter)
    else byTarget.set(v.target, [...(byTarget.get(v.target) ?? []), v.voter])
  }
  const groups = [...byTarget.entries()]
    .map(([target, voters]) => ({ target, voters: voters.sort((a, b) => a - b) }))
    .sort((a, b) => b.voters.length - a.voters.length || a.target - b.target)
  return { groups, abstained: abstained.sort((a, b) => a - b) }
}
