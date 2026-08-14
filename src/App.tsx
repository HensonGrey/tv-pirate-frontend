import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import GuestView from '@/components/GuestView'
import HomePage from '@/pages/home'
import RequireAuth from '@/components/require-auth'
import { SESSION_EXPIRED_EVENT } from '@/api/client'
import { fetchMe, logout } from '@/api/auth'
import { getUser, type StoredUser } from '@/lib/authStorage'

function App() {
  const [user, setUser] = useState<StoredUser | null>(getUser)
  // authChecked starts false: the UI waits for the /api/me probe before
  // deciding between the app and the login screen.
  const [authChecked, setAuthChecked] = useState(false)

  // Session probe: the httpOnly cookies are invisible to JS, so the only way
  // to answer "am I logged in?" is to ask the backend.
  useEffect(() => {
    let cancelled = false
    fetchMe().then((me) => {
      if (cancelled) return
      setUser(me)
      setAuthChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // If the silent refresh fails mid-session, the API client announces it via
  // a custom event — the guard then redirects to /login.
  useEffect(() => {
    function handleSessionExpired() {
      setUser(getUser())
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
  }, [])

  function handleLogout() {
    void logout() // local-first; the server revoke is best-effort inside
    setUser(getUser())
  }

  return (
    <div className="min-h-dvh bg-background bg-linear-to-b from-muted/40 via-background to-background">
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <GuestView onLoggedIn={() => setUser(getUser())} />
              )
            }
          />
          <Route element={<RequireAuth user={user} checked={authChecked} />}>
            {/* user is non-null here — RequireAuth redirects otherwise */}
            <Route path="/" element={<HomePage user={user!} onLogout={handleLogout} />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="bottom-right" />
      </BrowserRouter>
    </div>
  )
}

export default App
