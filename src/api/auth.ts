import axios from 'axios'
import { API_BASE, client } from './client'
import { clearUser, saveUser, type StoredUser } from '@/lib/authStorage'

export async function loginAsGuest(): Promise<StoredUser> {
  // The token pair arrives as Set-Cookie headers — nothing sensitive to store.
  const { data } = await client.post<StoredUser>('/api/auth/guest')
  saveUser(data)
  return data
}

/** Session probe: plain axios on purpose — a 401 here is an honest "not logged in", not something the silent refresh should recover. */
export async function fetchMe(): Promise<StoredUser | null> {
  try {
    const { data } = await axios.get<StoredUser>(`${API_BASE}/api/me`, { withCredentials: true })
    saveUser(data)
    return data
  } catch {
    clearUser()
    return null
  }
}

/** Local-first logout: UI clears immediately, server revoke is best-effort. */
export async function logout(): Promise<void> {
  clearUser()
  try {
    await client.post('/api/auth/logout')
  } catch (error) {
    console.error('Server-side logout failed', error)
  }
}
