import axios from 'axios';

/** How long a 429 asked us to wait (its Retry-After, in ms), or null for any other failure. vault:rate-limiting-deep-dive#frontend */
export function retryAfterMs(error: unknown): number | null {
    if (!axios.isAxiosError(error) || error.response?.status !== 429) return null;
    const seconds = Number(error.response.headers['retry-after']);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** The backend's own explanation (its ProblemDetail `detail`) when it sent one, else the fallback. */
export function getErrorMessage(error: unknown, fallback: string): string {
    const detail = axios.isAxiosError(error) ? error.response?.data?.detail : undefined;
    return typeof detail === 'string' && detail.trim() !== '' ? detail : fallback;
}

/** "20 s" under a minute, "18 min" above. */
export function formatWait(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}
