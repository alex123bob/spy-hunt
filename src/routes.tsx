import { Route, Routes } from 'react-router-dom'
import { Admin } from './screens/Admin'
import { BotPage } from './screens/BotPage'
import { Clan } from './screens/Clan'
import { Bots } from './screens/Bots'
import { Daily } from './screens/Daily'
import { Landing } from './screens/Landing'
import { MatchPage } from './screens/MatchPage'
import { HowToEarn } from './screens/HowToEarn'
import { Profile } from './screens/Profile'
import { Room } from './screens/Room'
import { Top } from './screens/Top'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/daily" element={<Daily />} />
      <Route path="/r/:code" element={<Room />} />
      <Route path="/bots" element={<Bots />} />
      <Route path="/bot/:id" element={<BotPage />} />
      <Route path="/top" element={<Top />} />
      <Route path="/me" element={<Profile />} />
      <Route path="/credits/how" element={<HowToEarn />} />
      <Route path="/clan" element={<Clan />} />
      <Route path="/match/:id" element={<MatchPage />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
