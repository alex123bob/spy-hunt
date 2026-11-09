import { useParams } from 'react-router-dom'

export function Room() {
  const { code } = useParams()
  return <main className="screen">Room {code}</main>
}
