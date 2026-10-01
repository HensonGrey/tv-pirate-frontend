import type { ProgressRow } from '@/api/progress';
import { fetchSeason } from '@/api/tmdb';

/** An episode of a show. */
export interface EpisodePoint {
    season: number;
    episode: number;
}

/** Where to pick a title back up. Season and episode are null for a movie. */
export interface ContinuePoint {
    season: number | null;
    episode: number | null;
    /** Seconds to seek to; null starts from the beginning. */
    resumeSeconds: number | null;
}

/** At 97% or more it counts as watched: resuming there would only replay the credits. */
export function isFinished(row: ProgressRow): boolean {
    return row.durationSeconds != null && row.progressSeconds >= row.durationSeconds * 0.97;
}

/** Where the viewer left off: their newest saved row, or the episode after it when that one is
 * finished. Null when there is nowhere better than where the page already is (nothing saved,
 * a finished movie, or the finale). `rows` are this title's, newest first. */
export async function continuePoint(
    rows: ProgressRow[],
    tmdbId: number,
    seasonCount: number,
): Promise<ContinuePoint | null> {
    const latest = rows[0];
    if (!latest) return null;
    if (!isFinished(latest)) {
        return {
            season: latest.season,
            episode: latest.episode,
            resumeSeconds: latest.progressSeconds,
        };
    }
    if (latest.season == null || latest.episode == null) return null;

    const next = await episodeAfter(tmdbId, latest.season, latest.episode, seasonCount);
    return next && { ...next, resumeSeconds: null };
}

/** The next episode in this season, else the first of the next season, else null. */
export async function episodeAfter(
    tmdbId: number,
    season: number,
    episode: number,
    seasonCount: number,
): Promise<EpisodePoint | null> {
    try {
        const info = await fetchSeason(tmdbId, season);
        if (info.episodes.some((ep) => ep.episodeNumber === episode + 1)) {
            return { season, episode: episode + 1 };
        }
        return season < seasonCount ? { season: season + 1, episode: 1 } : null;
    } catch {
        return null; // can't tell, so stay where we are
    }
}
