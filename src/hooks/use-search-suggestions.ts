import { useEffect, useState } from 'react';
import { searchTitles, type MediaItem } from '@/api/tmdb';

// The same limits as the home page's search (pages/home.tsx).
const MIN_SEARCH_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 350;
const MAX_SUGGESTIONS = 6;
/** One shared empty list: setting it again is not a change, so nothing re-renders. */
const NONE: MediaItem[] = [];

/** a0, b0, a1, b1, … — the best of each list first; the longer one fills the end. */
function interleave<T>(a: T[], b: T[]): T[] {
    const merged: T[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i < a.length) merged.push(a[i]);
        if (i < b.length) merged.push(b[i]);
    }
    return merged;
}

/** A few movies and shows matching `query`, for the nav's dropdown. Nothing under
 * 3 characters, and one fetch per pause in typing. `enabled` false never fetches. */
export function useSearchSuggestions(query: string, enabled: boolean): MediaItem[] {
    const [items, setItems] = useState(NONE);
    const trimmed = enabled ? query.trim() : '';

    useEffect(() => {
        if (trimmed.length < MIN_SEARCH_LENGTH) {
            setItems(NONE);
            return;
        }
        // The cleanup drops both a pending debounce and a response that lands after a newer query.
        let cancelled = false;
        const timer = setTimeout(() => {
            Promise.all([searchTitles('movie', trimmed), searchTitles('tv', trimmed)])
                .then(([movies, shows]) => {
                    if (cancelled) return;
                    setItems(interleave(movies.results, shows.results).slice(0, MAX_SUGGESTIONS));
                })
                // Suggestions are a convenience: Enter still opens the full search.
                .catch(() => {
                    if (!cancelled) setItems(NONE);
                });
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [trimmed]);

    return items;
}
