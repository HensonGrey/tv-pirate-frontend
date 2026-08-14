import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { clearUser, getUser } from '@/lib/authStorage'

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export const SESSION_EXPIRED_EVENT = 'tv-pirate:session-expired'

// withCredentials: the browser may send (and store) the httpOnly auth
// cookies on cross-origin calls (5173 → 8080). Without it, cookies would
// silently never leave the browser and every call would look unauthenticated.
export const client = axios.create({ baseURL: API_BASE, withCredentials: true })

// --- Silent refresh, deduplicated ---
// If several requests 401 at the same moment, they must share ONE refresh
// call: the backend burns the refresh token on every use (rotation), so
// parallel refreshes would all fail except one. The refresh token itself
// rides in a cookie — the client never sees or stores it.
let refreshPromise: Promise<void> | null = null

function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = axios
      // Plain axios on purpose: this call must NOT pass through the
      // interceptors, or a failed refresh would try to refresh itself.
      .post(`${API_BASE}/api/auth/refresh`, null, { withCredentials: true })
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

// --- Response interceptor: on 401, refresh once and retry the original request ---
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined

    if (error.response?.status === 401 && original && !original._retried && getUser()) {
      original._retried = true
      try {
        await refreshSession()
        return client(original) // the new cookies attach automatically on the retry
      } catch {
        // Refresh failed → the session is truly over.
        clearUser()
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      }
    }
    return Promise.reject(error)
  },
)
