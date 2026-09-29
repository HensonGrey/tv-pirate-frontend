import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchTitleDetail, type MediaItem, type MediaType } from '@/api/tmdb';
import { formatWait, retryAfterMs } from '@/lib/apiError';
import { titleKey } from '@/lib/titleKey';

/** Titles are fetched this many at a time, so a big library can't tie up the server's threads. */
const BATCH_SIZE = 6;

interface TitleRef {
    mediaType: MediaType;
    tmdbId: number;
}

/** The details behind the Library's cards, keyed by titleKey. Fetches only the titles it
 * doesn't have yet, and only while `active` (the Library is showing) — so a title added on
 * another device gets its card without refetching the rest. A title that fails is toasted
 * and tried again the next time the Library opens. Pass the same `titles` array until the
 * lists change (it's an effect dependency). */
export function useLibraryItems(active: boolean, titles: TitleRef[]) {
    const [items, setItems] = useState<Map<string, MediaItem>>(new Map());
    const [loading, setLoading] = useState(false);
    // Read inside the effect without making every loaded batch re-run it.
    const itemsRef = useRef(items);
    itemsRef.current = items;

    useEffect(() => {
        if (!active) return;
        const missing = uniqueTitles(titles).filter((title) => !itemsRef.current.has(title.key));
        if (missing.length === 0) return;
        let cancelled = false;
        setLoading(true);
        loadTitles(missing, () => cancelled).then(({ loaded, failures }) => {
            // Loaded details are good data even if this run was cancelled meanwhile.
            setItems((current) => new Map([...current, ...loaded]));
            if (cancelled) return;
            setLoading(false);
            if (failures.length > 0) toast.error(failureMessage(failures));
        });
        return () => {
            cancelled = true;
        };
    }, [active, titles]);

    return { items, loading };
}

/** Each title once, in first-seen order — a title can be both in progress and a favourite. */
function uniqueTitles(titles: TitleRef[]) {
    const unique = new Map<string, TitleRef & { key: string }>();
    for (const { mediaType, tmdbId } of titles) {
        const key = titleKey(mediaType, tmdbId);
        if (!unique.has(key)) unique.set(key, { key, mediaType, tmdbId });
    }
    return [...unique.values()];
}

/** The detail of every title, a batch at a time. Stops starting batches once `isCancelled` says so. */
async function loadTitles(titles: (TitleRef & { key: string })[], isCancelled: () => boolean) {
    const loaded = new Map<string, MediaItem>();
    const failures: unknown[] = [];
    for (let start = 0; start < titles.length && !isCancelled(); start += BATCH_SIZE) {
        await Promise.all(
            titles.slice(start, start + BATCH_SIZE).map(async (title) => {
                try {
                    loaded.set(title.key, await fetchTitleDetail(title.mediaType, title.tmdbId));
                } catch (error) {
                    failures.push(error);
                }
            }),
        );
    }
    return { loaded, failures };
}

/** "Could not load 3 titles in your library", with the wait when the server rate-limited us. */
function failureMessage(failures: unknown[]): string {
    const count = `${failures.length} title${failures.length === 1 ? '' : 's'}`;
    const wait = failures.map(retryAfterMs).find((ms) => ms !== null);
    return wait == null
        ? `Could not load ${count} in your library`
        : `Could not load ${count} — try again in ${formatWait(wait)}`;
}
