import { useEffect, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Skull, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import TopNav, { type TabId } from '@/components/top-nav';
import FeaturedBanner from '@/components/featured-banner';
import MediaCard from '@/components/media-card';
import MediaModal from '@/components/media-modal';
import Pagination from '@/components/pagination';
import { Button } from '@/components/ui/button';
import {
    fetchDiscover,
    fetchGenres,
    fetchTitleDetail,
    fetchTrending,
    searchTitles,
    type GenreInfo,
    type MediaItem,
    type MediaType,
    type PageResponse,
} from '@/api/tmdb';
import { clearProgress, fetchProgress, type ProgressRow } from '@/api/progress';
import { addFavourite, fetchFavourites, removeFavourite } from '@/api/favourites';
import { cn } from '@/lib/utils';
import { slugify } from '@/lib/slug';
import type { StoredUser } from '@/lib/authStorage';

interface HomePageProps {
    user: StoredUser;
    onLogout: () => void;
}

type TypeFilter = 'all' | MediaType;

/** Search only kicks in from 3 characters — shorter queries are noise (and,
 * against TMDB, wasted requests). */
const MIN_SEARCH_LENGTH = 3;
/** TMDB serves 20 results per page. */
const PAGE_SIZE = 20;
/** Keystrokes are debounced so a fetch fires only when typing pauses. */
const SEARCH_DEBOUNCE_MS = 350;

/** Stable key for a title across both id spaces — movie 123 ≠ tv 123. */
function favouriteKey(mediaType: string, id: number) {
    return `${mediaType}:${id}`;
}

function headingFor(tab: TabId, query: string, genres: Set<string>) {
    if (query) return `Results for “${query}”`;
    if (tab === 'genres') {
        return genres.size > 0 ? `Genres: ${[...genres].join(' + ')}` : 'Browse genres';
    }
    if (tab === 'shows') return 'TV shows';
    if (tab === 'movies') return 'Movies';
    return 'Trending now';
}

// --- Browse state: one reducer instead of a dozen useStates. ---
// Filter changes rewind the page, responses update items + loading + error
// together — every rule about how state moves lives in exactly one place.

interface BrowseState {
    tab: TabId;
    query: string;
    debouncedQuery: string;
    typeFilter: TypeFilter;
    genres: Set<string>;
    genreList: GenreInfo[];
    page: number;
    items: MediaItem[];
    totalPages: number;
    totalResults: number;
    loading: boolean;
    error: string | null;
    reloadKey: number; // bumped by retry to re-run the fetch
    selected: MediaItem | null;
    selectedDetail: MediaItem | null;
    // Server-backed favourites, keyed mediaType:tmdbId (the two TMDB id
    // spaces collide, so the id alone would mix movies and shows).
    favourites: Set<string>;
}

type BrowseAction =
    | { type: 'tab'; tab: TabId }
    | { type: 'query'; query: string }
    | { type: 'query-debounced'; query: string }
    | { type: 'type-filter'; typeFilter: TypeFilter }
    | { type: 'toggle-genre'; name: string }
    | { type: 'clear-genres' }
    | { type: 'page'; page: number }
    | { type: 'request-started' }
    | { type: 'request-skipped' }
    | { type: 'page-loaded'; items: MediaItem[]; totalPages: number; totalResults: number }
    | { type: 'request-failed'; message: string }
    | { type: 'retry' }
    | { type: 'genres-loaded'; genreList: GenreInfo[] }
    | { type: 'select'; item: MediaItem | null }
    | { type: 'detail'; item: MediaItem }
    | { type: 'toggle-favourite'; key: string }
    | { type: 'favourites-loaded'; favourites: Set<string> };

const initialState: BrowseState = {
    tab: 'trending',
    query: '',
    debouncedQuery: '',
    typeFilter: 'all',
    genres: new Set(),
    genreList: [],
    page: 1,
    items: [],
    totalPages: 0,
    totalResults: 0,
    loading: false,
    error: null,
    reloadKey: 0,
    selected: null,
    selectedDetail: null,
    favourites: new Set(),
};

function browseReducer(state: BrowseState, action: BrowseAction): BrowseState {
    switch (action.type) {
        case 'tab':
            // Re-selecting the active tab is a no-op — otherwise items clear
            // while the fetch effect sees no changed deps. vault:tmdb-deep-dive#tab-noop
            if (action.tab === state.tab) return state;
            // Tab and genre switches clear the results so the skeleton shows
            // instead of the previous tab's data lingering under a dim.
            return { ...state, tab: action.tab, page: 1, items: [] };
        case 'query':
            // Search changes keep old results dimmed while the new ones load.
            return { ...state, query: action.query, page: 1 };
        case 'query-debounced':
            return { ...state, debouncedQuery: action.query };
        case 'type-filter':
            return { ...state, typeFilter: action.typeFilter, page: 1 };
        case 'toggle-genre': {
            const genres = new Set(state.genres);
            if (genres.has(action.name)) genres.delete(action.name);
            else genres.add(action.name);
            return { ...state, genres, page: 1, items: [] };
        }
        case 'clear-genres':
            return { ...state, genres: new Set(), page: 1, items: [] };
        case 'page':
            return { ...state, page: action.page };
        case 'request-started':
            return { ...state, loading: true, error: null };
        case 'request-skipped':
            // Mid-typing (1–2 chars): nothing is fetched, so nothing is loading.
            return { ...state, loading: false };
        case 'page-loaded':
            return {
                ...state,
                items: action.items,
                totalPages: action.totalPages,
                totalResults: action.totalResults,
                loading: false,
            };
        case 'request-failed':
            return { ...state, error: action.message, loading: false };
        case 'retry':
            return { ...state, reloadKey: state.reloadKey + 1 };
        case 'genres-loaded':
            return { ...state, genreList: action.genreList };
        case 'select':
            // The list item opens the modal instantly; details arrive separately.
            return { ...state, selected: action.item, selectedDetail: null };
        case 'detail':
            return { ...state, selectedDetail: action.item };
        case 'toggle-favourite': {
            const favourites = new Set(state.favourites);
            if (favourites.has(action.key)) favourites.delete(action.key);
            else favourites.add(action.key);
            return { ...state, favourites };
        }
        case 'favourites-loaded':
            return { ...state, favourites: action.favourites };
        default:
            return state;
    }
}

/** One fetch for the current tab + filters; the genres tab with the "All"
 * toggle merges two discovers (movies + shows) into one page. */
async function loadPage(
    tab: TabId,
    typeFilter: TypeFilter,
    genres: string[],
    query: string,
    page: number,
): Promise<{ items: MediaItem[]; totalPages: number; totalResults: number }> {
    const toPage = (res: PageResponse<MediaItem>) => ({
        items: res.results,
        totalPages: res.totalPages,
        totalResults: res.totalResults,
    });
    if (query) return toPage(await searchTitles(query, page));
    if (tab === 'trending') return toPage(await fetchTrending('day', page));
    if (tab === 'movies') return toPage(await fetchDiscover('movie', [], page));
    if (tab === 'shows') return toPage(await fetchDiscover('tv', [], page));
    if (typeFilter !== 'all') return toPage(await fetchDiscover(typeFilter, genres, page));
    const [movies, shows] = await Promise.all([
        fetchDiscover('movie', genres, page),
        fetchDiscover('tv', genres, page),
    ]);
    return {
        items: [...movies.results, ...shows.results],
        totalPages: Math.max(movies.totalPages, shows.totalPages),
        totalResults: movies.totalResults + shows.totalResults,
    };
}

/** The browse home, fed by the TMDB proxy: one API call per tab, debounced
 * search, pagination from the response. While loading, previous results
 * stay dimmed; the skeleton only shows when there's nothing yet. */
/** Fold the tab/query a watch-page nav click hands over via route state
 * into the initial browse state (debouncedQuery prefilled so the search
 * fires immediately instead of waiting out the debounce). */
function initBrowseState(nav: { tab?: TabId; query?: string } | null): BrowseState {
    return {
        ...initialState,
        tab: nav?.tab ?? initialState.tab,
        query: nav?.query ?? '',
        debouncedQuery: nav?.query ?? '',
    };
}

export default function HomePage({ user, onLogout }: HomePageProps) {
    const location = useLocation();
    const [state, dispatch] = useReducer(
        browseReducer,
        (location.state as { tab?: TabId; query?: string } | null) ?? null,
        initBrowseState,
    );
    const navigate = useNavigate();
    const {
        tab,
        query,
        debouncedQuery,
        typeFilter,
        genres,
        genreList,
        page,
        items,
        totalPages,
        totalResults,
        loading,
        error,
        reloadKey,
        selected,
        selectedDetail,
        favourites,
    } = state;

    // Rapid like/unlike clicking: dismiss the previous favourite toast so the
    // stack doesn't pile up three-deep.
    const favouriteToastId = useRef<string | number | null>(null);
    // Monotonic request token: a response only lands if no newer request
    // started while it was in flight (fast tab/filter flipping).
    const requestId = useRef(0);
    // The modal's detail fetch may only deliver into the modal that asked.
    const selectedRef = useRef<MediaItem | null>(null);
    selectedRef.current = selected;
    // Real watch progress feeds the modal bars, keyed mediaType:tmdbId.
    const [progressByTitle, setProgressByTitle] = useState<Map<string, ProgressRow>>(new Map());

    const trimmed = query.trim();
    const debouncedTrimmed = debouncedQuery.trim();
    const searching = trimmed.length >= MIN_SEARCH_LENGTH;

    // Debounce the search box: the fetch reads debouncedTrimmed, so it only
    // fires once the user pauses.
    useEffect(() => {
        const timer = setTimeout(
            () => dispatch({ type: 'query-debounced', query: trimmed }),
            SEARCH_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
    }, [trimmed]);

    // Genre chips load once per session; the backend caches the table 24 h.
    useEffect(() => {
        fetchGenres()
            .then((list) => dispatch({ type: 'genres-loaded', genreList: list }))
            .catch(() => toast.error('Could not load the genre list'));
    }, []);

    // Real watch progress feeds the modal bars — one fetch per visit. Rows
    // come newest-first, so the first row per title is the winning one.
    useEffect(() => {
        let cancelled = false;
        fetchProgress()
            .then((rows) => {
                if (cancelled) return;
                const map = new Map<string, ProgressRow>();
                for (const row of rows) {
                    const key = `${row.mediaType}:${row.tmdbId}`;
                    if (!map.has(key)) map.set(key, row);
                }
                setProgressByTitle(map);
            })
            .catch(() => {
                // No bars is a graceful state — the modal just shows "Watch".
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // One shared favourites list seeds every heart; the watch page reads the
    // same GET, so both pages stay in sync with the server and each other.
    useEffect(() => {
        let cancelled = false;
        fetchFavourites()
            .then((rows) => {
                if (cancelled) return;
                dispatch({
                    type: 'favourites-loaded',
                    favourites: new Set(rows.map((row) => favouriteKey(row.mediaType, row.tmdbId))),
                });
            })
            .catch(() => {
                // No list is a graceful state — hearts just read as unliked.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // The main fetch. Re-runs on any tab/filter/page change; stale responses
    // are dropped by the requestId guard. Under-3-char queries skip it — the
    // "keep typing" hint owns the screen until then.
    useEffect(() => {
        if (debouncedTrimmed && debouncedTrimmed.length < MIN_SEARCH_LENGTH) {
            dispatch({ type: 'request-skipped' });
            return;
        }
        const id = ++requestId.current;
        dispatch({ type: 'request-started' });
        loadPage(tab, typeFilter, [...genres], debouncedTrimmed, page)
            .then((result) => {
                if (requestId.current !== id) return;
                dispatch({ type: 'page-loaded', ...result });
            })
            .catch(() => {
                if (requestId.current !== id) return;
                dispatch({
                    type: 'request-failed',
                    message:
                        "Couldn't load titles. The server may be busy — try again in a moment.",
                });
            });
    }, [tab, typeFilter, genres, page, debouncedTrimmed, reloadKey]);

    // Modal enrichment: the list item opens instantly, the detail call fills
    // in runtime/seasons behind it, and a closed modal discards the late answer.
    useEffect(() => {
        if (!selected || selected.mediaType == null) return;
        fetchTitleDetail(selected.mediaType, selected.id)
            .then((detail) => {
                if (selectedRef.current?.id === selected.id)
                    dispatch({ type: 'detail', item: detail });
            })
            .catch(() => {
                if (selectedRef.current?.id === selected.id)
                    toast.error('Could not load full details');
            });
    }, [selected]);

    function toggleFavourite(item: MediaItem) {
        if (!item.mediaType) return;
        const key = favouriteKey(item.mediaType, item.id);
        const isFavourite = favourites.has(key);
        dispatch({ type: 'toggle-favourite', key });
        // Local-first: the heart flips instantly and the request follows; only
        // a failure reverts the flip and says so. vault:favourites-deep-dive#optimistic-revert
        const request = isFavourite
            ? removeFavourite(item.id, item.mediaType)
            : addFavourite(item.id, item.mediaType);
        request.catch(() => {
            dispatch({ type: 'toggle-favourite', key }); // revert
            toast.error(
                `Could not ${isFavourite ? 'remove' : 'add'} “${item.title ?? 'Untitled'}”`,
            );
        });
        if (favouriteToastId.current !== null) toast.dismiss(favouriteToastId.current);
        favouriteToastId.current = isFavourite
            ? toast(`Removed “${item.title ?? 'Untitled'}” from your list`)
            : toast.success(`Added “${item.title ?? 'Untitled'}” to your list`);
    }

    /** "Start over": clear every saved row for the title (a show restarts
     * from S1E1), then jump into the player. Optimistic with a revert. */
    function startOver(target: MediaItem) {
        if (!target.mediaType) return;
        const key = `${target.mediaType}:${target.id}`;
        const row = progressByTitle.get(key);
        setProgressByTitle((current) => {
            const next = new Map(current);
            next.delete(key);
            return next;
        });
        clearProgress(target.mediaType, target.id).catch(() => {
            setProgressByTitle((current) => {
                const next = new Map(current);
                if (row) next.set(key, row);
                return next;
            });
            toast.error('Could not clear progress');
        });
        navigate(`/${target.mediaType}/${target.id}-${slugify(target.title)}`);
    }

    // Client-side narrowing of whatever page we hold: trending and search
    // return mixed pages, so the toggle can still slice them.
    const visibleItems =
        typeFilter === 'all' ? items : items.filter((m) => m.mediaType === typeFilter);
    const pageMovies = visibleItems.filter((m) => m.mediaType === 'movie');
    const pageShows = visibleItems.filter((m) => m.mediaType === 'tv');
    const showBanner = tab === 'trending' && !searching && page === 1 && visibleItems.length > 0;
    // 0 means "unknown" (TMDB can send null totals) — fall back to the page we hold.
    const pageCount = totalPages > 0 ? totalPages : 1;
    const totalShown = totalResults > 0 ? totalResults : items.length;
    const rangeStart = (page - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(page * PAGE_SIZE, totalShown);

    const mediaGrid = (gridItems: MediaItem[]) => (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {gridItems.map((item) => (
                <MediaCard
                    key={item.id}
                    item={item}
                    onSelect={(picked) => dispatch({ type: 'select', item: picked })}
                />
            ))}
        </div>
    );

    // The modal's bar: the winning row for the selected title, as a percent.
    const selectedProgressRow =
        selected?.mediaType != null
            ? progressByTitle.get(`${selected.mediaType}:${selected.id}`)
            : undefined;
    const selectedProgressPct =
        selectedProgressRow?.durationSeconds != null
            ? Math.round(
                  (selectedProgressRow.progressSeconds / selectedProgressRow.durationSeconds) * 100,
              )
            : undefined;

    return (
        <div className="min-h-dvh">
            <TopNav
                tab={tab}
                onTabChange={(next) => dispatch({ type: 'tab', tab: next })}
                query={query}
                onQueryChange={(next) => dispatch({ type: 'query', query: next })}
                user={user}
                onLogout={onLogout}
            />

            <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
                {/* Heading row: section title + movie/show toggle. */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5">
                        <h2 className="font-heading text-lg font-semibold tracking-tight">
                            {headingFor(tab, searching ? trimmed : '', genres)}
                        </h2>
                        {(!trimmed || searching) && (
                            <span className="text-sm text-muted-foreground">
                                {totalShown} titles
                            </span>
                        )}
                    </div>
                    <div
                        role="group"
                        aria-label="Filter by type"
                        className="flex rounded-full border bg-muted/60 p-0.5"
                    >
                        {(
                            [
                                ['all', 'All'],
                                ['movie', 'Movies'],
                                ['tv', 'Shows'],
                            ] as const
                        ).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={typeFilter === value}
                                onClick={() => dispatch({ type: 'type-filter', typeFilter: value })}
                                className={cn(
                                    'h-7 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
                                    typeFilter === value
                                        ? 'bg-gold text-gold-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {showBanner && (
                    <FeaturedBanner
                        item={visibleItems[0]}
                        onDetails={(picked) => dispatch({ type: 'select', item: picked })}
                        onWatch={(target) => {
                            // Same route as the card modal's Continue watching.
                            if (!target || target.mediaType == null) return;
                            navigate(`/${target.mediaType}/${target.id}-${slugify(target.title)}`);
                        }}
                    />
                )}

                {/* Genre chips on the Genres tab (until a search narrows things).
            Multi-select: click to toggle, several genres stack up. */}
                {tab === 'genres' && !searching && (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            aria-pressed={genres.size === 0}
                            onClick={() => dispatch({ type: 'clear-genres' })}
                            className={cn(
                                'rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
                                genres.size === 0
                                    ? 'border-gold bg-gold/15 text-gold'
                                    : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                            )}
                        >
                            All genres
                        </button>
                        {genreList.map((genre) => (
                            <button
                                key={genre.name}
                                type="button"
                                aria-pressed={genres.has(genre.name)}
                                onClick={() => dispatch({ type: 'toggle-genre', name: genre.name })}
                                className={cn(
                                    'rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
                                    genres.has(genre.name)
                                        ? 'border-gold bg-gold/15 text-gold'
                                        : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                                )}
                            >
                                {genre.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Content area. Previous results stay visible (dimmed) while a
            refetch runs; a skeleton shows only when there's nothing yet. */}
                <div
                    aria-busy={loading}
                    className={cn('transition-opacity', loading && 'opacity-60')}
                >
                    {!searching && trimmed ? (
                        <p className="py-24 text-center text-base text-muted-foreground">
                            Keep typing — search starts at {MIN_SEARCH_LENGTH} characters.
                        </p>
                    ) : error ? (
                        <div className="flex flex-col items-center gap-3 py-24 text-center">
                            <WifiOff aria-hidden className="size-10 text-muted-foreground" />
                            <p className="font-heading text-lg font-semibold">
                                Shore leave — the signal's down
                            </p>
                            <p className="max-w-sm text-base text-muted-foreground">{error}</p>
                            <Button variant="outline" onClick={() => dispatch({ type: 'retry' })}>
                                Try again
                            </Button>
                        </div>
                    ) : loading && items.length === 0 ? (
                        <>
                            <p role="status" className="sr-only">
                                Loading titles
                            </p>
                            <div
                                aria-hidden
                                className="mt-3 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                            >
                                {Array.from({ length: 12 }, (_, index) => (
                                    <div
                                        key={index}
                                        className="aspect-2/3 animate-pulse rounded-xl bg-muted/60"
                                    />
                                ))}
                            </div>
                        </>
                    ) : visibleItems.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-24 text-center">
                            <Skull aria-hidden className="size-10 text-muted-foreground" />
                            <p className="font-heading text-lg font-semibold">No treasure found</p>
                            <p className="max-w-sm text-base text-muted-foreground">
                                {searching
                                    ? `Nothing matches “${trimmed}”. Try a different title, or clear the filters.`
                                    : 'Nothing matches these filters. Loosen them up and cast another net.'}
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    dispatch({ type: 'query', query: '' });
                                    dispatch({ type: 'clear-genres' });
                                    dispatch({ type: 'type-filter', typeFilter: 'all' });
                                }}
                            >
                                Clear filters
                            </Button>
                        </div>
                    ) : typeFilter === 'all' ? (
                        <>
                            <section aria-label="Movies">
                                <h3 className="font-heading text-base font-semibold tracking-tight">
                                    Movies
                                </h3>
                                {pageMovies.length ? (
                                    mediaGrid(pageMovies)
                                ) : (
                                    <p className="mt-3 text-sm text-muted-foreground">
                                        No movies on this page — try the next one.
                                    </p>
                                )}
                            </section>
                            <section aria-label="Shows">
                                <h3 className="font-heading text-base font-semibold tracking-tight">
                                    Shows
                                </h3>
                                {pageShows.length ? (
                                    mediaGrid(pageShows)
                                ) : (
                                    <p className="mt-3 text-sm text-muted-foreground">
                                        No shows on this page — try the next one.
                                    </p>
                                )}
                            </section>
                        </>
                    ) : (
                        mediaGrid(visibleItems)
                    )}
                </div>

                {/* Pagination footer */}
                {visibleItems.length > 0 && (searching || !trimmed) && (
                    <div className="flex flex-col items-center gap-2 pt-4">
                        <p className="text-xs text-muted-foreground">
                            Showing {rangeStart}–{rangeEnd} of {totalShown}
                        </p>
                        <Pagination
                            page={page}
                            pageCount={pageCount}
                            onPageChange={(next) => {
                                dispatch({ type: 'page', page: next });
                                // Scroll lives here, not in the reducer — reducers stay pure.
                                window.scrollTo(0, 0);
                            }}
                        />
                    </div>
                )}
            </main>

            {selected && (
                <MediaModal
                    item={{
                        ...(selectedDetail ?? selected),
                        progress: selectedProgressPct,
                        progressSeason: selectedProgressRow?.season ?? undefined,
                        progressEpisode: selectedProgressRow?.episode ?? undefined,
                    }}
                    isFavourite={
                        selected.mediaType != null &&
                        favourites.has(favouriteKey(selected.mediaType, selected.id))
                    }
                    onToggleFavourite={() => toggleFavourite(selected)}
                    onWatch={() => {
                        const target = selectedDetail ?? selected;
                        if (!target || target.mediaType == null) return;
                        // The route carries the title's identity (id + slug); coordinates
                        // stay in the watch page's own state.
                        navigate(`/${target.mediaType}/${target.id}-${slugify(target.title)}`);
                    }}
                    onStartOver={() => startOver(selectedDetail ?? selected)}
                    onClose={() => dispatch({ type: 'select', item: null })}
                />
            )}
        </div>
    );
}
