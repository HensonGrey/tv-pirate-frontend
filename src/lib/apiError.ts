import axios from 'axios';

/** How long a 429 asked us to wait (its Retry-After, in ms), or null for any other failure. vault:rate-limiting-deep-dive#frontend */
export function retryAfterMs(error: unknown): number | null {
    if (!axios.isAxiosError(error) || error.response?.status !== 429) return null;
    const seconds = Number(error.response.headers['retry-after']);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

// Only these carry text written for a person: a 400 is our own bug and its detail describes the API, and every 5xx is scrubbed to one generic line.
const USER_FACING_STATUSES = new Set([403, 404, 429]);

/** The backend's own explanation when it wrote one for the user, else the fallback, which names what failed. */
export function getErrorMessage(error: unknown, fallback: string): string {
    if (!axios.isAxiosError(error)) return fallback;
    if (!error.response) return "Can't reach the server. Check your connection and try again.";
    const detail = error.response.data?.detail;
    return USER_FACING_STATUSES.has(error.response.status) &&
        typeof detail === 'string' &&
        detail.trim() !== ''
        ? detail
        : fallback;
}

/** "20 s" under a minute, "18 min" above. */
export function formatWait(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}
