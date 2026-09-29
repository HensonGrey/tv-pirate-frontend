import { useEffect, useMemo, useReducer } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import TopNav, { type TabId } from '@/components/top-nav';
import BrowseResults from '@/components/browse-results';
import GenreChips from '@/components/genre-chips';
import LibraryView from '@/components/library-view';
import MediaModalContainer from '@/components/media-modal-container';
import { fetchGenres, type GenreInfo, type MediaItem } from '@/api/tmdb';
import { useFavourites } from '@/hooks/use-favourites';
import { useLibraryItems } from '@/hooks/use-library-items';
import { useProgress } from '@/hooks/use-progress';
import { useTitleList } from '@/hooks/use-title-list';
import { continueCards, favouriteCards } from '@/lib/libraryCards';
import { LoadStatus } from '@/lib/loadStatus';
import { titleKey } from '@/lib/titleKey';
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
}

type BrowseAction =
    | { type: 'tab'; tab: TabId }
    | { type: 'query'; query: string }
    | { type: 'query-debounced'; query: string }
    | { type: 'query-restored'; query: string }
    | { type: 'toggle-genre'; name: string }
    | { type: 'clear-genres' }
    | { type: 'genres-loaded'; genreList: GenreInfo[] }
    | { type: 'select'; item: MediaItem | null };

const initialState: BrowseState = {
    tab: 'browse',
    query: '',
    debouncedQuery: '',
    genres: new Set(),
    genreList: [],
    selected: null,
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
            return { ...state, selected: action.item };
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
    const { tab, query, debouncedQuery, genres, genreList, selected } = state;

    // One list each, shared by the hearts, the modal's bar and the Library.
    const favourites = useFavourites();
    const progress = useProgress();
    const libraryTitles = useMemo(
        () => [...progress.rows, ...favourites.rows],
        [progress.rows, favourites.rows],
    );
    const library = useLibraryItems(tab === 'library', libraryTitles);

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

    /** Enter / the search icon: a search becomes its own history entry. On the
     * search page it replaces instead, so back doesn't step through every edit. */
    function submitSearch() {
        if (trimmed.length < MIN_SEARCH_LENGTH) return;
        navigate(searchPath(trimmed), { replace: isSearchPage });
    }

    /** "Start over": clear every saved row for the title, then jump into the player. */
    function startOver(target: MediaItem) {
        if (!target.mediaType) return;
        progress.clear(target.mediaType, target.id);
        navigate(watchPath(target.mediaType, target.id, target.title));
    }

    // Only a search's totals are real counts; trending and discover report
    // TMDB's page-capped numbers (10,000, 20,001), so the rows count loaded titles.
    const searchTotal = movies.totalResults + shows.totalResults;

    const continueList = continueCards(progress.rows, library.items);
    const favouriteList = favouriteCards(favourites.rows, library.items);

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
                        loading={
                            progress.status === LoadStatus.Loading ||
                            favourites.status === LoadStatus.Loading ||
                            (library.loading && continueList.length + favouriteList.length === 0)
                        }
                        error={
                            progress.status === LoadStatus.Failed ||
                            favourites.status === LoadStatus.Failed
                        }
                        onRetry={() => {
                            progress.reload();
                            favourites.reload();
                        }}
                        continueCards={continueList}
                        favouriteCards={favouriteList}
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
                <MediaModalContainer
                    key={titleKey(selected.mediaType ?? '', selected.id)}
                    selected={selected}
                    isFavourite={
                        selected.mediaType != null &&
                        favourites.keys.has(titleKey(selected.mediaType, selected.id))
                    }
                    progressRow={
                        selected.mediaType != null
                            ? progress.latestByTitle.get(titleKey(selected.mediaType, selected.id))
                            : undefined
                    }
                    onToggleFavourite={favourites.toggle}
                    onStartOver={startOver}
                    onClose={() => dispatch({ type: 'select', item: null })}
                />
            )}
        </div>
    );
}
