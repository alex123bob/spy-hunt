import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { NudgeBanner } from './components/NudgeBanner'
import { TopBar } from './components/TopBar'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <TopBar />
      <NudgeBanner />
      <AppRoutes />
    </BrowserRouter>
  )
}
