import { Route, Routes } from 'react-router-dom'
import { BotPage } from './screens/BotPage'
import { Daily } from './screens/Daily'
import { Landing } from './screens/Landing'
import { Room } from './screens/Room'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/daily" element={<Daily />} />
      <Route path="/r/:code" element={<Room />} />
      <Route path="/bot/:id" element={<BotPage />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
