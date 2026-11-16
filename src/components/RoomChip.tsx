import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { t, useLang } from '../i18n'
import { refreshMyRoom, useMyRoom } from '../state/myRoom'

// Floating way back into the room the player is still in. Hidden where it would be
// redundant: on that room's own screen and on the landing page (which has a banner).
// Also owns the refresh: on app load and whenever the player lands on a non-room page.
export function RoomChip() {
  useLang()
  const room = useMyRoom()
  const { pathname } = useLocation()
  const inRoomScreen = pathname.toLowerCase().startsWith('/r/')
  useEffect(() => {
    if (!inRoomScreen) void refreshMyRoom()
  }, [pathname, inRoomScreen])
  if (!room) return null
  if (pathname === '/' || pathname.toUpperCase() === `/R/${room.code}`) return null
  return (
    <Link to={`/r/${room.code}`} className="room-chip">
      {t('room.chip', { code: room.code })}
    </Link>
  )
}
