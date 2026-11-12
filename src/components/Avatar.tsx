import type { Avatar as AvatarData } from '../api/types'

export function Avatar({ player, size = 'm', out = false }: { player: { name: string; avatar?: AvatarData | null }; size?: 's' | 'm' | 'l'; out?: boolean }) {
  const a = player.avatar
  return (
    <span className={`avatar avatar-${size}${out ? ' is-out' : ''}`} aria-hidden style={a ? { background: a.color } : undefined}>
      {a ? a.emoji : [...player.name][0] ?? '?'}
    </span>
  )
}
