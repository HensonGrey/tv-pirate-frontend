/** The subtitle proxy: one VTT track per title/episode, resolved and
 * cached server-side (the OpenSubtitles key never reaches the browser).
 * A miss returns null — captions are an enhancement, never an error. */

import { client } from './client';
import type { MediaType } from './tmdb';

/** Fetch the subtitle track as raw VTT text, or null when the backend has
 * nothing (or no key configured yet). The caller parses + overlays it. */
export async function fetchSubtitleTrack(
    type: MediaType,
    tmdbId: number,
    season?: number,
    episode?: number,
): Promise<string | null> {
    const { data } = await client.get<string>('/api/subtitles', {
        params: { type, tmdbId, season, episode },
        responseType: 'text',
    });
    return data;
}
