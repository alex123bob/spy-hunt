import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { NudgeBanner } from './components/NudgeBanner'
import { TopBar } from './components/TopBar'

export default function App() {
  return (
    <BrowserRouter>
      <TopBar />
      <NudgeBanner />
      <AppRoutes />
    </BrowserRouter>
  )
}
