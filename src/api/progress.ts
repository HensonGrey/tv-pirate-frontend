/** The watch-progress API — the player heartbeats positions here and the
 * home screen reads them back for its progress bars. */

import { client } from './client';
import type { MediaType } from './tmdb';

/** One saved playback position; the backend returns them newest first. */
export interface ProgressRow {
    tmdbId: number;
    mediaType: MediaType;
    season: number | null;
    episode: number | null;
    progressSeconds: number;
    durationSeconds: number | null;
    updatedAt: string;
}

/** All saved positions for the signed-in user, newest first. */
export async function fetchProgress(): Promise<ProgressRow[]> {
    const { data } = await client.get<ProgressRow[]>('/api/progress');
    return data;
}

// When this tab sent each position (title, episode, second): its own live notes are skipped, so
// these only come back in a later reload, where the watch page must not take them for another
// device's. All are kept (a few a minute while playing), so a lost or reordered save still matches.
const sentAt = new Map<string, number>();

function positionKey(position: {
    tmdbId: number;
    mediaType: MediaType;
    season?: number | null;
    episode?: number | null;
    progressSeconds: number;
}): string {
    const { mediaType, tmdbId, season, episode, progressSeconds } = position;
    return `${mediaType}|${tmdbId}|${season ?? ''}|${episode ?? ''}|${progressSeconds}`;
}

/** One heartbeat. Season/episode only for tv — movies leave them undefined. */
export async function saveProgress(payload: {
    tmdbId: number;
    mediaType: MediaType;
    season?: number;
    episode?: number;
    progressSeconds: number;
    durationSeconds: number;
}): Promise<void> {
    // Noted before sending: a reload can read the row before this request answers.
    sentAt.set(positionKey(payload), performance.now());
    await client.put('/api/progress', payload);
}

/** True when this tab itself sent `row`'s position at or after `since` (a performance.now()). */
export function savedHereSince(row: ProgressRow, since: number): boolean {
    const at = sentAt.get(positionKey(row));
    return at !== undefined && at >= since;
}

/** "Start over": drop the row so the next visit starts from zero. */
export async function clearProgress(
    mediaType: MediaType,
    tmdbId: number,
    season?: number,
    episode?: number,
): Promise<void> {
    await client.delete(`/api/progress/${mediaType}/${tmdbId}`, {
        params: { season, episode },
    });
}
