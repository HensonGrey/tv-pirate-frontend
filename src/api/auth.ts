import axios from 'axios';
import { client } from './client';
import { clearUser, getUser, saveUser, type StoredUser } from '@/lib/authStorage';

export async function loginAsGuest(): Promise<StoredUser> {
    // The token pair arrives as Set-Cookie headers — nothing sensitive to store.
    const { data } = await client.post<StoredUser>('/api/auth/guest');
    saveUser(data);
    return data;
}

/** Session probe through the shared client, so an expired 15-min access cookie gets the silent refresh; only a 401 means "not logged in" — any other failure keeps the cached user. */
export async function fetchMe(): Promise<StoredUser | null> {
    try {
        const { data } = await client.get<StoredUser>('/api/me');
        saveUser(data);
        return data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
            clearUser();
            return null;
        }
        return getUser();
    }
}

/** Permanent: the account and everything it owns. Throws on failure so the caller can keep the user signed in. */
export async function deleteAccount(): Promise<void> {
    await client.delete('/api/auth/account');
}

/** Local-first logout: UI clears immediately, server revoke is best-effort. */
export async function logout(): Promise<void> {
    clearUser();
    try {
        await client.post('/api/auth/logout');
    } catch (error) {
        console.error('Server-side logout failed', error);
    }
}
