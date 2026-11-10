import { Route, Routes } from 'react-router-dom'
import { BotPage } from './screens/BotPage'
import { Bots } from './screens/Bots'
import { Daily } from './screens/Daily'
import { Landing } from './screens/Landing'
import { MatchPage } from './screens/MatchPage'
import { Room } from './screens/Room'
import { Top } from './screens/Top'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/daily" element={<Daily />} />
      <Route path="/r/:code" element={<Room />} />
      <Route path="/bots" element={<Bots />} />
      <Route path="/bot/:id" element={<BotPage />} />
      <Route path="/top" element={<Top />} />
      <Route path="/match/:id" element={<MatchPage />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
