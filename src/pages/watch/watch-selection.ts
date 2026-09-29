import type { MediaType } from '@/api/tmdb';
import { retryAfterMs } from '@/lib/apiError';

/** What's picked to watch. season/episode are set for TV only. */
export interface WatchSelection {
    mediaType: MediaType;
    tmdbId: number;
    season?: number;
    episode?: number;
}

const MAX_AUTO_RETRIES = 3;
const MAX_AUTO_RETRY_WAIT_MS = 60_000;

/** A 429 re-runs its effect once Retry-After has passed: up to 3 times per selection, and
 * only for short waits. Returns the wait in ms, or null to give up. vault:rate-limiting-deep-dive#frontend */
export function autoRetryWait(
    error: unknown,
    attempts: { selection: string; count: number },
    selection: string,
): number | null {
    if (attempts.selection !== selection) {
        attempts.selection = selection;
        attempts.count = 0;
    }
    const wait = retryAfterMs(error);
    if (wait === null || wait > MAX_AUTO_RETRY_WAIT_MS || attempts.count >= MAX_AUTO_RETRIES) {
        return null;
    }
    attempts.count++;
    return wait;
}
