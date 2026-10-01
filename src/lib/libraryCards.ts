import type { FavouriteRow } from '@/api/favourites';
import type { ProgressRow } from '@/api/progress';
import type { MediaItem } from '@/api/tmdb';
import { isFinished, type EpisodePoint } from '@/lib/continuePoint';
import { titleKey } from '@/lib/titleKey';

export interface ContinueCard {
    item: MediaItem;
    progressPct: number | null;
    badge: string | null;
}

/** Where the next episode was looked up for, so a stale answer can't match a newer row. */
export function nextUpKey(row: ProgressRow): string {
    return `${titleKey(row.mediaType, row.tmdbId)}|${row.season}|${row.episode}`;
}

/** The newest row of each show, when that episode is finished: the shows that might have a next one. */
export function finishedShowRows(progress: ProgressRow[]): ProgressRow[] {
    const seen = new Set<string>();
    return progress.filter((row) => {
        const key = titleKey(row.mediaType, row.tmdbId);
        if (seen.has(key)) return false;
        seen.add(key);
        return row.season != null && isFinished(row);
    });
}

/** One card per title: its newest saved row, a show having a row per episode watched.
 * Rows come newest first. A finished newest row of a show becomes its next episode, when
 * `nextUp` knows one; a finished movie or finale drops out, as an older half-watched
 * episode would mislead. Titles whose detail isn't loaded yet are skipped. */
export function continueCards(
    progress: ProgressRow[],
    items: Map<string, MediaItem>,
    nextUp: Map<string, EpisodePoint>,
): ContinueCard[] {
    const cards: ContinueCard[] = [];
    const seen = new Set<string>();
    for (const row of progress) {
        const key = titleKey(row.mediaType, row.tmdbId);
        if (seen.has(key)) continue;
        seen.add(key);
        const item = items.get(key);
        if (!item) continue;
        if (!isFinished(row)) {
            cards.push({
                item,
                progressPct: row.durationSeconds
                    ? Math.round((row.progressSeconds / row.durationSeconds) * 100)
                    : null,
                badge:
                    row.season != null && row.episode != null
                        ? `S${row.season}E${row.episode}`
                        : null,
            });
            continue;
        }
        const next = nextUp.get(nextUpKey(row));
        if (next) cards.push({ item, progressPct: null, badge: `S${next.season}E${next.episode}` });
    }
    return cards;
}

/** The favourites in the order the server sent them; titles whose detail isn't loaded yet are skipped. */
export function favouriteCards(
    favourites: FavouriteRow[],
    items: Map<string, MediaItem>,
): MediaItem[] {
    return favourites
        .map((row) => items.get(titleKey(row.mediaType, row.tmdbId)))
        .filter((item): item is MediaItem => item != null);
}
