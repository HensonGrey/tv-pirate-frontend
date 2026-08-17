export interface StoredUser {
    id: number;
    username: string;
    provider: string;
    /** Provider avatar URL (Google "picture"); null for guests → default avatar. */
    profilePictureUrl: string | null;
}

// Tokens live in httpOnly cookies set by the backend — JS can't touch them. localStorage only keeps non-sensitive user info so the UI knows which screen to show.
const USER_KEY = 'tv-pirate.user';

export function saveUser(user: StoredUser): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): StoredUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as StoredUser;
    } catch {
        // Corrupted storage — treat as logged out.
        clearUser();
        return null;
    }
}

export function clearUser(): void {
    localStorage.removeItem(USER_KEY);
}
