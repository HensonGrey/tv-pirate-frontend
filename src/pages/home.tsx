import { useEffect, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import TopNav, { type TabId } from '@/components/top-nav';
import BrowseResults from '@/components/browse-results';
import GenreChips from '@/components/genre-chips';
import LibraryView from '@/components/library-view';
import MediaModal from '@/components/media-modal';
import {
    fetchGenres,
    fetchTitleDetail,
    type GenreInfo,
    type MediaItem,
    type MediaType,
} from '@/api/tmdb';
import { useTitleList } from '@/hooks/use-title-list';
import { clearProgress, fetchProgress, type ProgressRow } from '@/api/progress';
import {
    addFavourite,
    fetchFavourites,
    removeFavourite,
    type FavouriteRow,
} from '@/api/favourites';
import { formatWait, retryAfterMs } from '@/lib/apiError';
import { watchPath } from '@/lib/watchPath';
import { searchPath } from '@/lib/searchPath';
import type { StoredUser } from '@/lib/authStorage';

interface HomePageProps {
    user: StoredUser;
    onLogout: () => void;
}

/** Search only kicks in from 3 characters — shorter queries are noise (and,
 * against TMDB, wasted requests). */
const MIN_SEARCH_LENGTH = 3;
/** Keystrokes are debounced so a fetch fires only when typing pauses. */
const SEARCH_DEBOUNCE_MS = 350;
/** Library titles are fetched this many at a time, so a big library can't tie up the server's threads. */
const LIBRARY_BATCH_SIZE = 6;

interface Library {
    progress: ProgressRow[];
    favourites: FavouriteRow[];
    /** Title details keyed like favouriteKey; a title that failed to load is missing. */
    items: Map<string, MediaItem>;
    /** One error per title that failed to load. */
    failures: unknown[];
}

/** The Library tab's data: both server lists, then the detail of every title in
 * them, a batch at a time. Stops fetching once `isCancelled` says so. */
async function loadLibrary(isCancelled: () => boolean): Promise<Library> {
    const [progress, favourites] = await Promise.all([fetchProgress(), fetchFavourites()]);
    const titles = uniqueTitles([...progress, ...favourites]);
    const items = new Map<string, MediaItem>();
    const failures: unknown[] = [];

    for (let start = 0; start < titles.length && !isCancelled(); start += LIBRARY_BATCH_SIZE) {
        const batch = titles.slice(start, start + LIBRARY_BATCH_SIZE);
        await Promise.all(
            batch.map(async (title) => {
                try {
                    items.set(title.key, await fetchTitleDetail(title.mediaType, title.tmdbId));
                } catch (error) {
                    failures.push(error);
                }
            }),
        );
    }
    return { progress, favourites, items, failures };
}

/** Each title once, in first-seen order — a title can be both in progress and a favourite. */
function uniqueTitles(rows: { mediaType: MediaType; tmdbId: number }[]) {
    const titles = new Map<string, { key: string; mediaType: MediaType; tmdbId: number }>();
    for (const { mediaType, tmdbId } of rows) {
        const key = favouriteKey(mediaType, tmdbId);
        if (!titles.has(key)) titles.set(key, { key, mediaType, tmdbId });
    }
    return [...titles.values()];
}

/** "Could not load 3 titles in your library", with the wait when the server rate-limited us. */
function libraryFailureMessage(failures: unknown[]): string {
    const count = `${failures.length} title${failures.length === 1 ? '' : 's'}`;
    const wait = failures.map(retryAfterMs).find((ms) => ms !== null);
    return wait == null
        ? `Could not load ${count} in your library`
        : `Could not load ${count} — try again in ${formatWait(wait)}`;
}

/** Stable key for a title across both id spaces — movie 123 ≠ tv 123. */
function favouriteKey(mediaType: string, id: number) {
    return `${mediaType}:${id}`;
}

function headingFor(tab: TabId, query: string, genres: Set<string>) {
    if (query) return `Results for “${query}”`;
    if (tab === 'library') return 'Library';
    return genres.size > 0 ? `Genres: ${[...genres].join(' + ')}` : 'Trending now';
}

// --- Browse state: the page's inputs (tab, search, genres) and the modal.
// The title lists themselves live in useTitleList, one per media type.

interface BrowseState {
    tab: TabId;
    query: string;
    debouncedQuery: string;
    genres: Set<string>;
    genreList: GenreInfo[];
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
    | { type: 'query-restored'; query: string }
    | { type: 'toggle-genre'; name: string }
    | { type: 'clear-genres' }
    | { type: 'genres-loaded'; genreList: GenreInfo[] }
    | { type: 'select'; item: MediaItem | null }
    | { type: 'detail'; item: MediaItem }
    | { type: 'toggle-favourite'; key: string }
    | { type: 'favourites-loaded'; favourites: Set<string> };

const initialState: BrowseState = {
    tab: 'browse',
    query: '',
    debouncedQuery: '',
    genres: new Set(),
    genreList: [],
    selected: null,
    selectedDetail: null,
    favourites: new Set(),
};

function browseReducer(state: BrowseState, action: BrowseAction): BrowseState {
    switch (action.type) {
        case 'tab':
            return { ...state, tab: action.tab };
        case 'query':
            return { ...state, query: action.query };
        case 'query-debounced':
            return { ...state, debouncedQuery: action.query };
        case 'query-restored':
            // The URL names what the box already holds (Enter, or the live
            // ?q= sync): keep the typed text, trailing space and all, and
            // just skip the debounce.
            if (action.query === state.query.trim()) {
                return { ...state, debouncedQuery: action.query };
            }
            return { ...state, query: action.query, debouncedQuery: action.query };
        case 'toggle-genre': {
            const genres = new Set(state.genres);
            if (genres.has(action.name)) genres.delete(action.name);
            else genres.add(action.name);
            return { ...state, genres };
        }
        case 'clear-genres':
            return { ...state, genres: new Set() };
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

/** Fold the tab a watch-page nav click hands over via route state, and the
 * search page's ?q=, into the initial browse state (debouncedQuery prefilled
 * so the search fires immediately instead of waiting out the debounce). */
function initBrowseState(seed: { tab?: TabId; query: string }): BrowseState {
    return {
        ...initialState,
        tab: seed.tab ?? initialState.tab,
        query: seed.query,
        debouncedQuery: seed.query,
    };
}

/** The browse home, fed by the TMDB proxy: a movie list and a show list,
 * debounced search. While loading, previous results stay dimmed; the
 * skeleton only shows when there's nothing yet. */
export default function HomePage({ user, onLogout }: HomePageProps) {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    // "/" and "/search?q=" both render this page; only the search page has a query in its URL.
    const isSearchPage = location.pathname === '/search';
    const urlQuery = isSearchPage ? (searchParams.get('q') ?? '').trim() : '';
    const [state, dispatch] = useReducer(
        browseReducer,
        { tab: (location.state as { tab?: TabId } | null)?.tab, query: urlQuery },
        initBrowseState,
    );
    const navigate = useNavigate();
    const { tab, query, debouncedQuery, genres, genreList, selected, selectedDetail, favourites } =
        state;

    // Rapid like/unlike clicking: dismiss the previous favourite toast so the
    // stack doesn't pile up three-deep.
    const favouriteToastId = useRef<string | number | null>(null);
    // The modal's detail fetch may only deliver into the modal that asked.
    const selectedRef = useRef<MediaItem | null>(null);
    selectedRef.current = selected;
    // Real watch progress feeds the modal bars, keyed mediaType:tmdbId.
    const [progressByTitle, setProgressByTitle] = useState<Map<string, ProgressRow>>(new Map());
    // Library tab data: the two server lists plus one detail fetch per title.
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [libraryError, setLibraryError] = useState(false);
    const [libraryReloadKey, setLibraryReloadKey] = useState(0);
    const [libraryProgress, setLibraryProgress] = useState<ProgressRow[]>([]);
    const [libraryFavourites, setLibraryFavourites] = useState<FavouriteRow[]>([]);
    const [libraryItems, setLibraryItems] = useState<Map<string, MediaItem>>(new Map());

    const trimmed = query.trim();
    const debouncedTrimmed = debouncedQuery.trim();
    const searching = trimmed.length >= MIN_SEARCH_LENGTH;

    // Under-3-char queries fetch nothing: the "keep typing" hint owns the screen.
    const tooShort = debouncedTrimmed !== '' && debouncedTrimmed.length < MIN_SEARCH_LENGTH;
    // The Library tab shows its own view; everything else, both rows.
    const source =
        tooShort || (tab === 'library' && !debouncedTrimmed)
            ? null
            : {
                  genres: [...genres].sort().join(),
                  query: debouncedTrimmed,
              };
    const movies = useTitleList('movie', source);
    const shows = useTitleList('tv', source);

    // Debounce the search box: the fetch reads debouncedTrimmed, so it only
    // fires once the user pauses.
    useEffect(() => {
        const timer = setTimeout(
            () => dispatch({ type: 'query-debounced', query: trimmed }),
            SEARCH_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
    }, [trimmed]);

    // URL → box: back/forward between searches (or back to "/") shows the
    // query that history entry was for.
    useEffect(() => {
        dispatch({ type: 'query-restored', query: urlQuery });
    }, [urlQuery]);

    // Box → URL: typing on home opens the search page once the query is long
    // enough (a push, so back returns to home); on the search page, live typing
    // keeps ?q= current (replace, not push), so coming back from a title lands
    // on the latest search, and an emptied box leaves for home. Runs on
    // debouncedTrimmed only: on back/forward the URL changes first, and the
    // stale box must not win.
    useEffect(() => {
        if (!isSearchPage) {
            if (debouncedTrimmed.length >= MIN_SEARCH_LENGTH)
                navigate(searchPath(debouncedTrimmed));
            return;
        }
        if (!debouncedTrimmed) navigate('/', { replace: true });
        else if (debouncedTrimmed !== urlQuery) {
            setSearchParams({ q: debouncedTrimmed }, { replace: true });
        }
    }, [debouncedTrimmed]);

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
                    const key = favouriteKey(row.mediaType, row.tmdbId);
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

    // The library tab loads once per activation (see loadLibrary).
    useEffect(() => {
        if (tab !== 'library') return;
        let cancelled = false;
        setLibraryLoading(true);
        setLibraryError(false);
        loadLibrary(() => cancelled)
            .then((library) => {
                if (cancelled) return;
                setLibraryProgress(library.progress);
                setLibraryFavourites(library.favourites);
                setLibraryItems(library.items);
                // A title that failed used to vanish silently; say so.
                if (library.failures.length > 0) {
                    toast.error(libraryFailureMessage(library.failures));
                }
            })
            .catch(() => {
                if (!cancelled) setLibraryError(true);
            })
            .finally(() => {
                if (!cancelled) setLibraryLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tab, libraryReloadKey]);

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

    /** Enter / the search icon: a search becomes its own history entry. On the
     * search page it replaces instead, so back doesn't step through every edit. */
    function submitSearch() {
        if (trimmed.length < MIN_SEARCH_LENGTH) return;
        navigate(searchPath(trimmed), { replace: isSearchPage });
    }

    function toggleFavourite(item: MediaItem) {
        if (!item.mediaType) return;
        const mediaType = item.mediaType;
        const key = favouriteKey(mediaType, item.id);
        const isFavourite = favourites.has(key);
        dispatch({ type: 'toggle-favourite', key });
        // The library's Favourites section renders its own list — sync it
        // optimistically so a heart click inside the library shows up at once.
        const previousLibraryFavourites = libraryFavourites;
        const previousLibraryItems = libraryItems;
        if (isFavourite) {
            setLibraryFavourites((list) =>
                list.filter((fav) => favouriteKey(fav.mediaType, fav.tmdbId) !== key),
            );
        } else {
            setLibraryFavourites((list) => [...list, { tmdbId: item.id, mediaType }]);
            // The detail is already in hand — park it so the card renders even
            // if the library's own detail fetch never saw this title.
            setLibraryItems((map) => new Map(map).set(key, item));
        }
        // Local-first: the heart flips instantly and the request follows; only
        // a failure reverts the flip and says so. vault:favourites-deep-dive#optimistic-revert
        const request = isFavourite
            ? removeFavourite(item.id, mediaType)
            : addFavourite(item.id, mediaType);
        request.catch(() => {
            dispatch({ type: 'toggle-favourite', key }); // revert
            setLibraryFavourites(previousLibraryFavourites);
            setLibraryItems(previousLibraryItems);
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
        const key = favouriteKey(target.mediaType, target.id);
        const row = progressByTitle.get(key);
        setProgressByTitle((current) => {
            const next = new Map(current);
            next.delete(key);
            return next;
        });
        // Same optimistic sync as the heart: the library's continue cards
        // must drop the row without waiting for a refetch.
        const previousLibraryProgress = libraryProgress;
        setLibraryProgress((list) =>
            list.filter((row) => !(row.tmdbId === target.id && row.mediaType === target.mediaType)),
        );
        clearProgress(target.mediaType, target.id).catch(() => {
            setProgressByTitle((current) => {
                const next = new Map(current);
                if (row) next.set(key, row);
                return next;
            });
            setLibraryProgress(previousLibraryProgress);
            toast.error('Could not clear progress');
        });
        navigate(watchPath(target.mediaType, target.id, target.title));
    }

    // Only a search's totals are real counts; trending and discover report
    // TMDB's page-capped numbers (10,000, 20,001), so the rows count loaded titles.
    const searchTotal = movies.totalResults + shows.totalResults;

    // Library cards: continue-watching rows (finished ones stay out — they'd
    // resume at the credits) plus the favourites list, both as MediaItems.
    const libraryContinueCards: {
        item: MediaItem;
        progressPct: number | null;
        badge: string | null;
    }[] = [];
    for (const row of libraryProgress) {
        const finished =
            row.durationSeconds != null && row.progressSeconds >= row.durationSeconds * 0.97;
        if (finished) continue;
        const item = libraryItems.get(favouriteKey(row.mediaType, row.tmdbId));
        if (!item) continue; // a failed detail fetch just skips the card
        libraryContinueCards.push({
            item,
            progressPct: row.durationSeconds
                ? Math.round((row.progressSeconds / row.durationSeconds) * 100)
                : null,
            badge:
                row.season != null && row.episode != null ? `S${row.season}E${row.episode}` : null,
        });
    }
    const libraryFavouriteCards = libraryFavourites
        .map((fav) => libraryItems.get(favouriteKey(fav.mediaType, fav.tmdbId)))
        .filter((item): item is MediaItem => item != null);

    // The modal's bar: the winning row for the selected title, as a percent.
    const selectedProgressRow =
        selected?.mediaType != null
            ? progressByTitle.get(favouriteKey(selected.mediaType, selected.id))
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
                onTabChange={(next) => {
                    dispatch({ type: 'tab', tab: next });
                    // A tab leaves the search page — its query clears with the URL.
                    if (isSearchPage) navigate('/');
                }}
                query={query}
                onQueryChange={(next) => dispatch({ type: 'query', query: next })}
                onSubmit={submitSearch}
                user={user}
                onLogout={onLogout}
            />

            <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5">
                        <h2 className="font-heading text-lg font-semibold tracking-tight">
                            {headingFor(tab, searching ? trimmed : '', genres)}
                        </h2>
                        {searching && searchTotal > 0 && (
                            <span className="text-sm text-muted-foreground">
                                {searchTotal} results
                            </span>
                        )}
                    </div>
                </div>

                {tab === 'browse' && !searching && (
                    <GenreChips
                        genreList={genreList}
                        selected={genres}
                        onToggle={(name) => dispatch({ type: 'toggle-genre', name })}
                        onClear={() => dispatch({ type: 'clear-genres' })}
                    />
                )}

                {tab === 'library' && !trimmed ? (
                    <LibraryView
                        loading={libraryLoading}
                        error={libraryError}
                        onRetry={() => setLibraryReloadKey((key) => key + 1)}
                        continueCards={libraryContinueCards}
                        favouriteCards={libraryFavouriteCards}
                        onSelect={(picked) => dispatch({ type: 'select', item: picked })}
                        onBrowse={() => dispatch({ type: 'tab', tab: 'browse' })}
                    />
                ) : !searching && trimmed ? (
                    <p className="py-24 text-center text-base text-muted-foreground">
                        Keep typing — search starts at {MIN_SEARCH_LENGTH} characters.
                    </p>
                ) : (
                    <BrowseResults
                        movies={movies}
                        shows={shows}
                        idle={source === null}
                        searching={searching}
                        query={trimmed}
                        resetKey={`${tab}|${[...genres].join()}|${debouncedTrimmed}`}
                        onSelect={(picked) => dispatch({ type: 'select', item: picked })}
                        onClearFilters={() => {
                            dispatch({ type: 'query', query: '' });
                            dispatch({ type: 'clear-genres' });
                        }}
                    />
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
                        navigate(watchPath(target.mediaType, target.id, target.title));
                    }}
                    onStartOver={() => startOver(selectedDetail ?? selected)}
                    onClose={() => dispatch({ type: 'select', item: null })}
                />
            )}
        </div>
    );
}
