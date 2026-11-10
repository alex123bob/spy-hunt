import type { Avatar as AvatarData } from '../api/types'

export function Avatar({ player }: { player: { name: string; avatar?: AvatarData | null } }) {
  const a = player.avatar
  return (
    <span className="avatar" aria-hidden style={a ? { background: a.color } : undefined}>
      {a ? a.emoji : [...player.name][0] ?? '?'}
    </span>
  )
}
