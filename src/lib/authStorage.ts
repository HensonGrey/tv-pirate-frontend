export interface StoredUser {
  id: number
  username: string
  provider: string
}

// The JWT pair lives in httpOnly cookies set by the backend — JS can't (and
// shouldn't) touch them. localStorage only keeps the non-sensitive user info
// so the UI knows whether to show the guest or the logged-in screen.
const USER_KEY = 'tv-pirate.user'

export function saveUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredUser
  } catch {
    // Corrupted storage — treat as logged out.
    clearUser()
    return null
  }
}

export function clearUser(): void {
  localStorage.removeItem(USER_KEY)
}
