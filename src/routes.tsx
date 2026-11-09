import { Route, Routes } from 'react-router-dom'
import { Landing } from './screens/Landing'
import { Room } from './screens/Room'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/r/:code" element={<Room />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
