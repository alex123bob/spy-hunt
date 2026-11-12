const KEY = 'spy-hunt.admin-token'

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setToken(t: string): void {
  try {
    sessionStorage.setItem(KEY, t)
  } catch {
    // sessionStorage can be unavailable (private mode, blocked); ignore
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
