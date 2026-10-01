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
import { LoadStatusEnum } from '@/lib/loadStatusEnum';
import { titleKey } from '@/lib/titleKey';
import { watchPath } from '@/lib/watchPath';
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

// --- Browse state: the page's inputs (tab, search box) and the modal. The
// selected genres live in the URL (?genres=), not here.
// The title lists themselves live in useTitleList, one per media type.

interface BrowseState {
    tab: TabId;
    query: string;
    debouncedQuery: string;
    genreList: GenreInfo[];
    selected: MediaItem | null;
}

type BrowseAction =
    | { type: 'tab'; tab: TabId }
    | { type: 'query'; query: string }
    | { type: 'query-debounced'; query: string }
    | { type: 'query-restored'; query: string }
    | { type: 'genres-loaded'; genreList: GenreInfo[] }
    | { type: 'select'; item: MediaItem | null };

const initialState: BrowseState = {
    tab: 'browse',
    query: '',
    debouncedQuery: '',
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
            // The URL names what the box already holds (the live ?search= sync):
            // keep the typed text, trailing space and all, and just skip the
            // debounce.
            if (action.query === state.query.trim()) {
                return { ...state, debouncedQuery: action.query };
            }
            return { ...state, query: action.query, debouncedQuery: action.query };
        case 'genres-loaded':
            return { ...state, genreList: action.genreList };
        case 'select':
            return { ...state, selected: action.item };
        default:
            return state;
    }
}

/** Fold the tab a watch-page nav click hands over via route state, and the
 * URL's ?search=, into the initial browse state (debouncedQuery prefilled so the
 * search fires immediately instead of waiting out the debounce). */
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
    // The search and the genre chips both live in the URL: /?search=star+wars&genres=Action,Drama
    const urlQuery = (searchParams.get('search') ?? '').trim();
    const urlGenres = searchParams.get('genres') ?? '';
    const genres = useMemo(() => new Set(urlGenres.split(',').filter(Boolean)), [urlGenres]);
    const [state, dispatch] = useReducer(
        browseReducer,
        { tab: (location.state as { tab?: TabId } | null)?.tab, query: urlQuery },
        initBrowseState,
    );
    const navigate = useNavigate();
    const { tab, query, debouncedQuery, genreList, selected } = state;

    /** Set params (an empty value removes one), keeping the rest; replace, so
     * back doesn't step through every keystroke and chip click. */
    function updateParams(patch: { search?: string; genres?: string }) {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                for (const [key, value] of Object.entries(patch)) {
                    if (value) next.set(key, value);
                    else next.delete(key);
                }
                return next;
            },
            { replace: true },
        );
    }

    function toggleGenre(name: string) {
        const next = new Set(genres);
        if (!next.delete(name)) next.add(name);
        updateParams({ genres: [...next].sort().join(',') });
    }

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

    // URL → box: back/forward, or a link with ?search=, shows the query that
    // history entry was for.
    useEffect(() => {
        dispatch({ type: 'query-restored', query: urlQuery });
    }, [urlQuery]);

    // Box → URL: live typing keeps ?search= current, so coming back from a title
    // lands on the latest search. Runs on debouncedTrimmed only: on
    // back/forward the URL changes first, and the stale box must not win.
    useEffect(() => {
        if (debouncedTrimmed !== urlQuery) updateParams({ search: debouncedTrimmed });
    }, [debouncedTrimmed]);

    // Genre chips load once per session; the backend caches the table 24 h.
    useEffect(() => {
        fetchGenres()
            .then((list) => dispatch({ type: 'genres-loaded', genreList: list }))
            .catch(() => toast.error('Could not load the genre list'));
    }, []);

    /** Enter / the search icon: search now instead of waiting out the debounce. */
    function submitSearch() {
        if (trimmed.length < MIN_SEARCH_LENGTH) return;
        dispatch({ type: 'query-debounced', query: trimmed });
        updateParams({ search: trimmed });
    }

    /** "Start over": clear every saved row for the title, then jump into the player. */
    function startOver(target: MediaItem) {
        if (!target.mediaType) return;
        const { mediaType, id, title } = target;
        // Go once the rows are gone: the watch page loads them on arrival.
        void progress.clear(mediaType, id).then(() => navigate(watchPath(mediaType, id, title)));
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
                    // A tab click ends the search.
                    updateParams({ search: '' });
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
                        onToggle={toggleGenre}
                        onClear={() => updateParams({ genres: '' })}
                    />
                )}

                {tab === 'library' && !trimmed ? (
                    <LibraryView
                        loading={
                            progress.status === LoadStatusEnum.Loading ||
                            favourites.status === LoadStatusEnum.Loading ||
                            (library.loading && continueList.length + favouriteList.length === 0)
                        }
                        error={
                            progress.status === LoadStatusEnum.Failed ||
                            favourites.status === LoadStatusEnum.Failed
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
                            updateParams({ search: '', genres: '' });
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
