import { useEffect, useRef, useState } from 'react';
import type { ProgressRow } from '@/api/progress';
import type { MediaItem } from '@/api/tmdb';
import { episodeAfter, type EpisodePoint } from '@/lib/continuePoint';
import { finishedShowRows, nextUpKey } from '@/lib/libraryCards';
import { titleKey } from '@/lib/titleKey';

interface Lookup {
    key: string;
    tmdbId: number;
    from: EpisodePoint;
    seasonCount: number;
}

/** The next episode for each show whose newest saved episode is finished, so the Library can
 * offer it. Keyed by nextUpKey(row). One season lookup per such show, and only when the
 * finished episode changes; until it lands the show simply has no card. */
export function useNextUp(progress: ProgressRow[], items: Map<string, MediaItem>) {
    const [nextUp, setNextUp] = useState<Map<string, EpisodePoint>>(new Map());

    const lookups: Lookup[] = [];
    for (const row of finishedShowRows(progress)) {
        const item = items.get(titleKey(row.mediaType, row.tmdbId));
        if (!item || row.season == null || row.episode == null) continue;
        lookups.push({
            key: nextUpKey(row),
            tmdbId: row.tmdbId,
            from: { season: row.season, episode: row.episode },
            seasonCount: item.seasons ?? 1,
        });
    }
    const lookupsRef = useRef(lookups);
    lookupsRef.current = lookups;
    // Progress reloads every few seconds while another device plays; this only changes
    // when a finished episode does.
    const wanted = lookups.map((lookup) => lookup.key).join(',');

    useEffect(() => {
        let cancelled = false;
        Promise.all(
            lookupsRef.current.map(async ({ key, tmdbId, from, seasonCount }) => {
                const next = await episodeAfter(tmdbId, from.season, from.episode, seasonCount);
                return [key, next] as const;
            }),
        ).then((entries) => {
            if (cancelled) return;
            setNextUp(new Map(entries.flatMap(([key, next]) => (next ? [[key, next]] : []))));
        });
        return () => {
            cancelled = true;
        };
    }, [wanted]);

    return nextUp;
}
