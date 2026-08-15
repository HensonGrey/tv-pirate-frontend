import { Navigate, Outlet } from 'react-router'
import type { StoredUser } from '@/lib/authStorage'

/** Full-screen splash while the startup /api/me probe is in flight. */
function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="animate-pulse text-sm text-muted-foreground">tv-pirate</p>
    </div>
  )
}

/** Client-side route guard (UX only — the backend enforces auth on every request). Splash while the session probe is in flight, redirect to /login once the answer is known. */
export default function RequireAuth({
  user,
  checked,
}: {
  user: StoredUser | null
  checked: boolean
}) {
  if (!checked) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
