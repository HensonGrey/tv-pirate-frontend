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

/** One heartbeat. Season/episode only for tv — movies leave them undefined. */
export async function saveProgress(payload: {
    tmdbId: number;
    mediaType: MediaType;
    season?: number;
    episode?: number;
    progressSeconds: number;
    durationSeconds: number;
}): Promise<void> {
    await client.put('/api/progress', payload);
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
