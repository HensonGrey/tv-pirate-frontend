import { useEffect, useReducer, useRef } from 'react';
import {
    fetchDiscover,
    fetchTrending,
    searchTitles,
    type MediaItem,
    type MediaType,
} from '@/api/tmdb';

/** What a list shows. `genres` is comma-joined (the wire format); '' = none. */
export interface ListSource {
    genres: string;
    query: string;
}

export interface TitleList {
    items: MediaItem[];
    page: number;
    /** 0 = unknown (TMDB can send null totals). */
    totalPages: number;
    totalResults: number;
    /** The first page is on its way. */
    loading: boolean;
    loadingMore: boolean;
    failed: boolean;
    moreFailed: boolean;
    canLoadMore: boolean;
    loadMore: () => void;
    retry: () => void;
}

/** Loading more never takes less than this: the skeleton's shimmer plays one
 * full 1s sweep; a shorter wait cuts it off mid-sweep and reads as a flicker. */
const LOAD_MORE_MIN_MS = 1000;

interface ListState {
    key: string;
    // What is shown (genres, or "search"): a change clears the items; a new query only dims them.
    viewKey: string;
    page: number;
    items: MediaItem[];
    totalPages: number;
    totalResults: number;
    loading: boolean;
    failed: boolean;
    moreFailed: boolean;
    reloadKey: number;
}

type ListAction =
    | { type: 'reset'; key: string; viewKey: string }
    | { type: 'started' }
    | {
          type: 'loaded';
          items: MediaItem[];
          totalPages: number;
          totalResults: number;
          append: boolean;
      }
    | { type: 'failed'; append: boolean }
    | { type: 'load-more' }
    | { type: 'retry' };

function emptyList(key: string, viewKey: string): ListState {
    return {
        key,
        viewKey,
        page: 1,
        items: [],
        totalPages: 0,
        totalResults: 0,
        loading: false,
        failed: false,
        moreFailed: false,
        reloadKey: 0,
    };
}

function listReducer(state: ListState, action: ListAction): ListState {
    switch (action.type) {
        case 'reset': {
            const fresh = emptyList(action.key, action.viewKey);
            return action.viewKey === state.viewKey ? { ...fresh, items: state.items } : fresh;
        }
        case 'started':
            return { ...state, loading: true, failed: false, moreFailed: false };
        case 'loaded':
            return {
                ...state,
                items: action.append ? appendNewTitles(state.items, action.items) : action.items,
                totalPages: action.totalPages,
                totalResults: action.totalResults,
                loading: false,
            };
        case 'failed':
            // page stays on the failed page, so retry refetches it.
            return action.append
                ? { ...state, loading: false, moreFailed: true }
                : { ...state, loading: false, failed: true };
        case 'load-more':
            // Sets loading itself, so no second load-more fires before this page lands.
            if (state.loading || state.moreFailed || state.page >= state.totalPages) return state;
            return { ...state, page: state.page + 1, loading: true };
        case 'retry':
            return { ...state, reloadKey: state.reloadKey + 1 };
        default:
            return state;
    }
}

/** TMDB pages shift between fetches, so titles already loaded are skipped. */
function appendNewTitles(loaded: MediaItem[], next: MediaItem[]): MediaItem[] {
    const seen = new Set(loaded.map((item) => item.id));
    return [...loaded, ...next.filter((item) => !seen.has(item.id))];
}

/** One page of one type: search wins, then genres; no genres = trending. */
function fetchTitles(type: MediaType, genres: string, query: string, page: number) {
    if (query) return searchTitles(type, query, page);
    if (!genres) return fetchTrending(type, 'day', page);
    return fetchDiscover(type, genres.split(','), page);
}

/** A row's next page: fetchTitles, held to at least LOAD_MORE_MIN_MS. */
async function fetchMoreTitles(type: MediaType, genres: string, query: string, page: number) {
    const minWait = new Promise((resolve) => setTimeout(resolve, LOAD_MORE_MIN_MS));
    const [result] = await Promise.all([fetchTitles(type, genres, query, page), minWait]);
    return result;
}

/** One media type's row on the browse page; each next page is added after
 * the loaded ones. `source` null = not shown (nothing is fetched). */
export function useTitleList(type: MediaType, source: ListSource | null): TitleList {
    const active = source != null;
    const query = source?.query ?? '';
    // A search ignores the genres, so they're neutral here: toggling a chip
    // mid-search mustn't refetch it.
    const genres = (!query && source?.genres) || '';
    const viewKey = !active ? 'off' : query ? 'search' : `browse|${genres}`;
    const key = `${viewKey}|${query}`;

    const [state, dispatch] = useReducer(listReducer, key, (initial) =>
        emptyList(initial, viewKey),
    );
    // A new source resets the list during render, before any effect sees the old page.
    if (state.key !== key) dispatch({ type: 'reset', key, viewKey });

    // A response only lands if no newer request started while it was in flight.
    const requestId = useRef(0);
    const { page, reloadKey } = state;

    useEffect(() => {
        const id = ++requestId.current;
        if (!active) return;
        const more = page > 1;
        dispatch({ type: 'started' });
        (more ? fetchMoreTitles : fetchTitles)(type, genres, query, page)
            .then((result) => {
                if (requestId.current !== id) return;
                dispatch({
                    type: 'loaded',
                    items: result.results,
                    totalPages: result.totalPages,
                    totalResults: result.totalResults,
                    append: more,
                });
            })
            .catch(() => {
                if (requestId.current === id) dispatch({ type: 'failed', append: more });
            });
    }, [active, type, genres, query, page, reloadKey]);

    const loadingMore = state.loading && page > 1;
    return {
        items: state.items,
        page,
        totalPages: state.totalPages,
        totalResults: state.totalResults,
        loading: state.loading && !loadingMore,
        loadingMore,
        failed: state.failed,
        moreFailed: state.moreFailed,
        canLoadMore: !state.loading && !state.moreFailed && page < state.totalPages,
        loadMore: () => dispatch({ type: 'load-more' }),
        retry: () => dispatch({ type: 'retry' }),
    };
}
