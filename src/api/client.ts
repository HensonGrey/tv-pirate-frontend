import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { clearUser, getUser } from '@/lib/authStorage';

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export const SESSION_EXPIRED_EVENT = 'tv-pirate:session-expired';

// withCredentials lets the browser send (and store) the httpOnly auth cookies cross-origin (5173 → 8080).
export const client = axios.create({ baseURL: API_BASE, withCredentials: true });

// Names this tab. The server echoes it in the live-sync note that a write causes,
// so the tab can skip its own. Must match SyncHub.CLIENT_ID_HEADER on the backend.
export const CLIENT_ID = crypto.randomUUID();
const CLIENT_ID_HEADER = 'X-Client-Id';

// Only writes carry it: on a GET a custom header would force a CORS preflight per read.
client.interceptors.request.use((config) => {
    if (config.method?.toLowerCase() !== 'get') config.headers.set(CLIENT_ID_HEADER, CLIENT_ID);
    return config;
});

// One shared refresh per burst: rotation burns the refresh token on every use, so parallel 401s must share a single call. vault:auth-deep-dive#tokens
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
    if (!refreshPromise) {
        refreshPromise = axios
            // Plain axios: a failed refresh must not try to refresh itself.
            .post(`${API_BASE}/api/auth/refresh`, null, { withCredentials: true })
            .then(() => undefined)
            .finally(() => {
                refreshPromise = null;
            });
    }
    return refreshPromise;
}

/** A refused refresh can just mean another tab won the race: both sent the same one-time
 * refresh cookie and the other tab's went first. Its new cookies are shared, so if the
 * session probe now works, the session is fine. Only a 401 here means it's really over. */
async function anotherTabRefreshed(): Promise<boolean> {
    try {
        // Plain axios: this probe must not trigger another refresh.
        await axios.get(`${API_BASE}/api/me`, { withCredentials: true });
        return true;
    } catch (probeError) {
        return !(axios.isAxiosError(probeError) && probeError.response?.status === 401);
    }
}

// On 401: refresh once, then retry the original request.
client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const original = error.config as
            (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

        if (error.response?.status === 401 && original && !original._retried && getUser()) {
            original._retried = true;
            try {
                await refreshSession();
            } catch (refreshError) {
                // Only a 401 from the refresh itself ends the session; a 429, 5xx or network blip keeps it. vault:rate-limiting-deep-dive#frontend
                if (!axios.isAxiosError(refreshError) || refreshError.response?.status !== 401) {
                    return Promise.reject(refreshError);
                }
                if (!(await anotherTabRefreshed())) {
                    clearUser();
                    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
                    return Promise.reject(error);
                }
            }
            // Not awaited: a failed retry must reach the caller, not be mistaken for a failed refresh.
            return client(original);
        }
        return Promise.reject(error);
    },
);
