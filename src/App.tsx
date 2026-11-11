import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { TopBar } from './components/TopBar'

export default function App() {
  return (
    <BrowserRouter>
      <TopBar />
      <AppRoutes />
    </BrowserRouter>
  )
}
