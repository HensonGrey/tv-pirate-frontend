import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TopNav from '@/components/top-nav';
import Kicker from '@/components/kicker';
import { fetchTitleDetail, type MediaItem, type MediaType } from '@/api/tmdb';
import { fetchProgress, type ProgressRow } from '@/api/progress';
import { getPreferredProvider } from '@/lib/providerPreference';
import { searchPath } from '@/lib/searchPath';
import type { StoredUser } from '@/lib/authStorage';
import ExpandableDescription from './expandable-description';
import EpisodePanel from './episode-panel';
import PlayerSection from './player-section';
import ProviderPicker from './provider-picker';
import WatchHeader from './watch-header';

interface WatchPageProps {
    /** Fixed by the route (/movie/:id vs /tv/:id) — never part of query state. */
    mediaType: MediaType;
    /** App-shell props so the top nav renders here too. */
    user: StoredUser;
    onLogout: () => void;
}

/** Full-screen watch page at /movie/{id-slug} or /tv/{id-slug}. The URL
 * carries only the title's identity — season/episode live in component
 * state (TV defaults to S1E1; saved watch progress seeds them on mount).
 * Nothing streams until Play is pressed (see usePlayback).
 * vault:streaming-providers-deep-dive#architecture */
export default function WatchPage({ mediaType, user, onLogout }: WatchPageProps) {
    const navigate = useNavigate();
    // "/tv/1396-breaking-bad" — the leading digits are the tmdb id, the slug is decorative.
    const { id: idParam } = useParams<{ id: string }>();
    const tmdbId = Number(/^(\d+)/.exec(idParam ?? '')?.[1] ?? 0);
    const isTv = mediaType === 'tv';

    // The nav's search doesn't filter this page — Enter carries the query to
    // the search page (/?search=).
    const [query, setQuery] = useState('');

    const [item, setItem] = useState<MediaItem | null>(null);
    const [loadError, setLoadError] = useState(false);

    const [season, setSeason] = useState(1);
    const [episode, setEpisode] = useState(1);
    // Saved positions for this title — seeds the resume seek and the pickers.
    const [titleProgress, setTitleProgress] = useState<ProgressRow[]>([]);
    // Seek target for the player's next mount; null = start from zero.
    const [resumeTarget, setResumeTarget] = useState<number | null>(null);
    const [provider, setProvider] = useState<string | null>(getPreferredProvider());

    // Live position shared with ProgressTracker: a provider switch remounts
    // the player and continues from here.
    const lastPositionRef = useRef(0);

    // The page owns its data (the URL is the only seed): a reload refetches
    // the title, so nothing depends on navigation state surviving.
    useEffect(() => {
        if (!tmdbId) {
            setLoadError(true);
            return;
        }
        let cancelled = false;
        fetchTitleDetail(mediaType, tmdbId)
            .then((detail) => {
                if (!cancelled) setItem(detail);
            })
            .catch(() => {
                if (!cancelled) setLoadError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [mediaType, tmdbId]);

    // Watch progress seeds the resume point: the newest row for this title
    // picks season/episode (tv) and becomes the player's seek target.
    // Finished rows (>= 97%) don't resume — that would replay the credits.
    useEffect(() => {
        if (!tmdbId) return;
        let cancelled = false;
        fetchProgress()
            .then((rows) => {
                if (cancelled) return;
                const forTitle = rows.filter(
                    (row) => row.tmdbId === tmdbId && row.mediaType === mediaType,
                );
                setTitleProgress(forTitle);
                const latest = forTitle[0]; // the backend sorts newest first
                if (!latest) return;
                const finished =
                    latest.durationSeconds != null &&
                    latest.progressSeconds >= latest.durationSeconds * 0.97;
                if (!finished) {
                    setResumeTarget(latest.progressSeconds);
                    if (mediaType === 'tv' && latest.season != null && latest.episode != null) {
                        setSeason(latest.season);
                        setEpisode(latest.episode);
                    }
                }
            })
            .catch(() => {
                // Progress is an enhancement — no row, no resume, no toast.
            });
        return () => {
            cancelled = true;
        };
    }, [tmdbId, mediaType]);

    function selectSeason(next: number) {
        setSeason(next);
        setEpisode(1); // a new season starts at its first episode
        // Resume in-session too: a saved S4E1 continues, everything else starts at 0.
        const row = titleProgress.find((r) => r.season === next && r.episode === 1);
        setResumeTarget(row?.progressSeconds ?? null);
        lastPositionRef.current = 0;
    }

    function selectEpisode(next: number) {
        setEpisode(next);
        const row = titleProgress.find((r) => r.season === season && r.episode === next);
        setResumeTarget(row?.progressSeconds ?? null);
        lastPositionRef.current = 0;
    }

    const selection = {
        mediaType,
        tmdbId,
        season: isTv ? season : undefined,
        episode: isTv ? episode : undefined,
    };
    // The backdrop is wider than the poster — it suits the ambient glow.
    const playerThumb = item?.backdropUrl ?? item?.posterUrl;

    let content: ReactNode;
    if (loadError || !tmdbId) {
        content = (
            <div className="flex min-h-[calc(100dvh-56px)] flex-col items-center justify-center gap-3 px-6 text-center">
                <WifiOff aria-hidden className="size-10 text-muted-foreground" />
                <p className="font-heading text-lg font-semibold">Title not found</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                    This link doesn't point at a title we can load.
                </p>
                <Button variant="outline" onClick={() => navigate('/')}>
                    Back to browsing
                </Button>
            </div>
        );
    } else if (!item) {
        content = (
            <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
                <div className="h-11 w-1/3 animate-pulse rounded-lg bg-muted/60" />
                <div className="grid gap-5 sm:grid-cols-[1fr_280px] lg:grid-cols-[1fr_360px]">
                    <div className="aspect-video animate-pulse rounded-2xl bg-muted/60" />
                    <div className="hidden h-72 animate-pulse rounded-2xl bg-muted/60 sm:block" />
                </div>
            </div>
        );
    } else {
        content = (
            <div>
                {/* From sm up, the picker card sits beside the player (streaming-site
          layout) so the page height is just nav + header + player — no
          scrolling. At lg the player surface is pinned to the viewport
          (dvh-230px ≈ nav 57 + header ~110 + gaps) so it's as large as the
          window allows; the column is wider than home's and the nav follows
          via its wide prop. Phones stack the card below and scroll. */}
                <main className="relative mx-auto flex w-full max-w-[min(96rem,calc(44dvh*16/9+32px))] flex-col px-4 py-2 sm:max-w-[min(96rem,calc((100dvh-210px)*16/9+348px))] sm:px-6 lg:max-w-[min(96rem,calc((100dvh-230px)*16/9+444px))] lg:px-8">
                    <WatchHeader item={item} mediaType={mediaType} />

                    <div className="grid gap-5 sm:grid-cols-[1fr_280px] lg:grid-cols-[1fr_360px]">
                        <PlayerSection
                            item={item}
                            provider={provider}
                            selection={selection}
                            resumeTarget={resumeTarget}
                            onResumeConsumed={() => setResumeTarget(null)}
                            lastPositionRef={lastPositionRef}
                        />

                        {/* Picker card: sections split by hairlines; the panel fits its
              content height instead of stretching to the player surface.
              The sm max-h cap is only a safety valve for very short windows. */}
                        <div className="flex self-start overflow-hidden rounded-2xl bg-card ring-1 ring-border sm:max-h-[calc(100dvh-210px)] sm:overflow-y-auto">
                            <div className="flex h-full w-full flex-col divide-y divide-border">
                                {isTv ? (
                                    <EpisodePanel
                                        tmdbId={tmdbId}
                                        seasonCount={item.seasons ?? 1}
                                        season={season}
                                        episode={episode}
                                        showOverview={item.overview}
                                        onSelectSeason={selectSeason}
                                        onSelectEpisode={selectEpisode}
                                    />
                                ) : (
                                    <div className="flex flex-col gap-1.5 p-4">
                                        <Kicker>About</Kicker>
                                        {item.overview != null && (
                                            <ExpandableDescription
                                                key={item.overview}
                                                text={item.overview}
                                            />
                                        )}
                                    </div>
                                )}

                                <ProviderPicker provider={provider} onChange={setProvider} />
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="relative min-h-dvh">
            {/* The backdrop doubles as page ambience: blurred and masked into the
          background so the header and player sit on atmosphere, not flat bg.
          Lives outside content so it never stretches the page; the outer
          wrapper stays overflow-visible or the nav's sticky would break. */}
            {playerThumb && (
                <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-[calc(100dvh-60px)] overflow-hidden"
                >
                    <img
                        src={playerThumb}
                        alt=""
                        className="size-full scale-110 object-cover opacity-25 blur-3xl"
                    />
                    <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/70 to-background" />
                </div>
            )}
            {/* Same app shell as home: tabs navigate back to the matching section,
          search runs on Enter by opening the search page. */}
            <TopNav
                wide
                onTabChange={(tab) => navigate('/', { state: { tab } })}
                query={query}
                onQueryChange={setQuery}
                onSubmit={() => {
                    if (query.trim()) navigate(searchPath(query.trim()));
                }}
                user={user}
                onLogout={onLogout}
            />
            {content}
        </div>
    );
}
