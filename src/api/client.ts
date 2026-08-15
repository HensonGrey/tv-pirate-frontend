import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { clearUser, getUser } from '@/lib/authStorage'

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export const SESSION_EXPIRED_EVENT = 'tv-pirate:session-expired'

// withCredentials lets the browser send (and store) the httpOnly auth cookies cross-origin (5173 → 8080).
export const client = axios.create({ baseURL: API_BASE, withCredentials: true })

// One shared refresh per burst: rotation burns the refresh token on every use, so parallel 401s must share a single call. vault:auth-deep-dive#tokens
let refreshPromise: Promise<void> | null = null

function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = axios
      // Plain axios: a failed refresh must not try to refresh itself.
      .post(`${API_BASE}/api/auth/refresh`, null, { withCredentials: true })
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

// On 401: refresh once, then retry the original request.
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
