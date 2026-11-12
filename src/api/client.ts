export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message?: string) {
    super(message || code)
    this.status = status
    this.code = code
  }
}

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/spy-hunt'

let credentials: { playerId: string; token: string } | null = null

export function setCredentials(c: { playerId: string; token: string } | null): void {
  credentials = c
}

export function authHeaders(): Record<string, string> {
  return credentials ? { Authorization: `Bearer ${credentials.playerId}.${credentials.token}` } : {}
}

export async function request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        ...authHeaders(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network', 'Network error')
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string }
    throw new ApiError(res.status, d.error ?? 'error', d.message)
  }
  return data as T
}

export const api = { request }
