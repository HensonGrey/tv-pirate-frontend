import type { FavouriteRow } from '@/api/favourites';
import type { ProgressRow } from '@/api/progress';
import type { MediaItem } from '@/api/tmdb';
import { titleKey } from '@/lib/titleKey';

export interface ContinueCard {
    item: MediaItem;
    progressPct: number | null;
    badge: string | null;
}

/** One card per show: its newest saved row, a show having a row per episode watched.
 * Rows come newest first. A finished newest row hides the show — resuming at the credits
 * would be pointless, and an older half-watched episode would mislead. Titles whose detail
 * isn't loaded yet are skipped. */
export function continueCards(
    progress: ProgressRow[],
    items: Map<string, MediaItem>,
): ContinueCard[] {
    const cards: ContinueCard[] = [];
    const seen = new Set<string>();
    for (const row of progress) {
        const key = titleKey(row.mediaType, row.tmdbId);
        if (seen.has(key)) continue;
        seen.add(key);
        const finished =
            row.durationSeconds != null && row.progressSeconds >= row.durationSeconds * 0.97;
        const item = items.get(key);
        if (finished || !item) continue;
        cards.push({
            item,
            progressPct: row.durationSeconds
                ? Math.round((row.progressSeconds / row.durationSeconds) * 100)
                : null,
            badge:
                row.season != null && row.episode != null ? `S${row.season}E${row.episode}` : null,
        });
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
