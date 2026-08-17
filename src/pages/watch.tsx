import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import '@vidstack/react/player/styles/default/gestures.css';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Film, Heart, LoaderCircle, Play, Star, Tv, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { MediaPlayer, MediaProvider, Poster } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { Button } from '@/components/ui/button';
import TopNav from '@/components/top-nav';
import CaptionOverlay from '@/components/caption-overlay';
import ProgressTracker from '@/components/progress-tracker';
import SubtitleDelayMenu from '@/components/subtitle-delay-menu';
import { cn } from '@/lib/utils';
import {
    fetchSeason,
    fetchTitleDetail,
    type MediaItem,
    type MediaType,
    type SeasonInfo,
} from '@/api/tmdb';
import {
    absoluteProxyUrl,
    fetchSources,
    fetchStreamProviders,
    type StreamSourceDto,
} from '@/api/stream';
import { fetchSubtitleTrack } from '@/api/subtitles';
import { fetchProgress, type ProgressRow } from '@/api/progress';
import { addFavourite, fetchFavourites, removeFavourite } from '@/api/favourites';
import { parseVtt, type VttCue } from '@/lib/vtt';
import { getPreferredProvider, setPreferredProvider } from '@/lib/providerPreference';
import type { StoredUser } from '@/lib/authStorage';

interface WatchPageProps {
    /** Fixed by the route (/movie/:id vs /tv/:id) — never part of query state. */
    mediaType: MediaType;
    /** App-shell props so the top nav renders here too. */
    user: StoredUser;
    onLogout: () => void;
}

/** Pick the row to play without asking the user: exact 720p wins, else the
 * highest row ≤ 720p, else the lowest row ("auto" rows sort last, so they
 * only win when nothing numeric exists). */
function pickDefaultSource(sources: StreamSourceDto[]): StreamSourceDto | null {
    if (sources.length === 0) return null;
    const numeric = sources.filter((s) => /^\d+p$/.test(s.quality));
    const exact = numeric.find((s) => s.quality === '720p');
    if (exact) return exact;
    const under = numeric.filter((s) => parseInt(s.quality, 10) <= 720);
    if (under.length > 0) return under[under.length - 1];
    return sources[0];
}

/** Shared pill styling for season + provider chips — selected is solid gold,
 * the rest stay quiet outlines. */
function chipClasses(selected: boolean) {
    return cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
        selected
            ? 'border-gold bg-gold font-semibold text-gold-foreground shadow-sm'
            : 'border-border text-muted-foreground hover:border-gold/50 hover:text-foreground',
    );
}

/** Small uppercase label that anchors each picker section — gold so the
 * labels read as headings, not part of the muted content they describe. */
function Kicker({ children }: { children: React.ReactNode }) {
    return <p className="text-xs font-bold tracking-wider text-gold uppercase">{children}</p>;
}

/** Full-screen watch page at /movie/{id-slug} or /tv/{id-slug}. The URL
 * carries only the title's identity — season/episode live in component
 * state (TV defaults to S1E1; saved watch progress seeds them on mount).
 * Clicking the video surface starts playback — no play button.
 * vault:streaming-providers-deep-dive#architecture */
export default function WatchPage({ mediaType, user, onLogout }: WatchPageProps) {
    const navigate = useNavigate();
    // "/tv/1396-breaking-bad" — the leading digits are the tmdb id, the slug is decorative.
    const { id: idParam } = useParams<{ id: string }>();
    const tmdbId = Number(/^(\d+)/.exec(idParam ?? '')?.[1] ?? 0);
    const isTv = mediaType === 'tv';

    // The nav's search doesn't filter this page — Enter carries the query to
    // home via route state, where the browse reducer picks it up on mount.
    const [query, setQuery] = useState('');

    const [item, setItem] = useState<MediaItem | null>(null);
    const [loadError, setLoadError] = useState(false);

    const [providers, setProviders] = useState<string[]>([]);
    const [season, setSeason] = useState(1);
    const [episode, setEpisode] = useState(1);
    // Saved positions for this title — seeds the resume seek and the pickers.
    const [titleProgress, setTitleProgress] = useState<ProgressRow[]>([]);
    // Seek target for the player's next mount; null = start from zero.
    const [resumeTarget, setResumeTarget] = useState<number | null>(null);
    // The season/episode the current sources were resolved for. The tracker
    // renders only while the stream matches the picker, so a heartbeat can
    // never credit the old stream's position to a newly picked episode.
    const [resolvedCoords, setResolvedCoords] = useState<{
        season: number;
        episode: number;
    } | null>(null);
    const [provider, setProvider] = useState<string | null>(getPreferredProvider());
    // Seeded from the shared favourites list on mount, so the heart survives
    // reloads and matches home. vault:favourites-deep-dive#schema
    const [isFavourite, setIsFavourite] = useState(false);

    const [seasonInfo, setSeasonInfo] = useState<SeasonInfo | null>(null);
    const [episodesLoading, setEpisodesLoading] = useState(false);

    const [resolving, setResolving] = useState(false);
    const [sources, setSources] = useState<StreamSourceDto[] | null>(null);
    // Parsed caption cues for the current title/episode (empty = no captions).
    const [subtitleCues, setSubtitleCues] = useState<VttCue[]>([]);
    // Manual sync shift in half-second ticks: every sub file is timed to its
    // own release, so a constant offset against the stream is normal —
    // positive = delay the track. Ticks keep the 0.5s steps float-drift-free.
    const [subtitleDelay, setSubtitleDelay] = useState(0);

    // Monotonic request tokens so a fast season-flip can't deliver stale episodes.
    const episodeRequestId = useRef(0);
    const providerRequestId = useRef(0);
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

    // The heart's initial state comes from the shared favourites list — the
    // same GET home reads, so both pages stay in sync.
    useEffect(() => {
        if (!tmdbId) return;
        let cancelled = false;
        fetchFavourites()
            .then((rows) => {
                if (cancelled) return;
                setIsFavourite(
                    rows.some((row) => row.tmdbId === tmdbId && row.mediaType === mediaType),
                );
            })
            .catch(() => {
                // No list is a graceful state — the heart reads as unliked.
            });
        return () => {
            cancelled = true;
        };
    }, [tmdbId, mediaType]);

    // Provider list loads once; the remembered one wins, else the first listed.
    useEffect(() => {
        const id = ++providerRequestId.current;
        fetchStreamProviders()
            .then((list) => {
                if (providerRequestId.current !== id) return;
                setProviders(list);
                // A remembered provider can vanish from the registry (removed, or a
                // burned upstream) — fall back to the first listed instead of
                // resolving a name the backend rejects.
                setProvider((current) =>
                    current != null && list.includes(current) ? current : (list[0] ?? null),
                );
            })
            .catch(() => toast.error('Could not load the provider list'));
    }, []);

    // Season data follows the selected season.
    useEffect(() => {
        if (!isTv || !tmdbId) return;
        const id = ++episodeRequestId.current;
        setEpisodesLoading(true);
        fetchSeason(tmdbId, season)
            .then((info) => {
                if (episodeRequestId.current !== id) return;
                setSeasonInfo(info);
                if (!info.episodes.some((ep) => ep.episodeNumber === episode)) setEpisode(1);
            })
            .catch(() => {
                if (episodeRequestId.current !== id) return;
                toast.error('Could not load the episode list');
            })
            .finally(() => {
                if (episodeRequestId.current !== id) return;
                setEpisodesLoading(false);
            });
    }, [isTv, tmdbId, season]); // episode intentionally not a dep: changing it must not refetch

    // Resolve-on-change, not resolve-on-play: sources follow provider/season/
    // episode automatically. Cancelled runs stay silent — that's what keeps a
    // fast chip-flip from spamming toasts.
    useEffect(() => {
        if (!provider || !item) {
            setSources(null);
            return;
        }
        let cancelled = false;
        setResolving(true);
        fetchSources(
            provider,
            mediaType,
            tmdbId,
            isTv ? season : undefined,
            isTv ? episode : undefined,
        )
            .then((result) => {
                if (cancelled) return;
                setSources(result);
                setResolvedCoords(isTv ? { season, episode } : null);
            })
            .catch(() => {
                if (cancelled) return;
                toast.error(`Could not resolve sources from ${provider}`);
            })
            .finally(() => {
                if (!cancelled) setResolving(false);
            });
        return () => {
            cancelled = true;
        };
    }, [provider, item, mediaType, tmdbId, isTv, season, episode]);

    // Subtitles are an enhancement: one silent fetch per title/episode, and
    // the player just runs caption-less when the lookup misses.
    useEffect(() => {
        if (!item) return;
        let cancelled = false;
        setSubtitleCues([]);
        setSubtitleDelay(0); // a new file is a new release — its own offset
        fetchSubtitleTrack(mediaType, tmdbId, isTv ? season : undefined, isTv ? episode : undefined)
            .then((vtt) => {
                if (!cancelled && vtt) setSubtitleCues(parseVtt(vtt));
            })
            .catch(() => {
                // No captions is a graceful state — never a toast.
            });
        return () => {
            cancelled = true;
        };
    }, [mediaType, tmdbId, isTv, season, episode, item]);

    function goBack() {
        // Direct URL visits have no in-app history — navigate(-1) would leave the app.
        if (window.history.state?.idx) navigate(-1);
        else navigate('/');
    }

    function selectProvider(next: string) {
        setProvider(next);
        setPreferredProvider(next);
    }

    function toggleFavourite() {
        const wasFavourite = isFavourite;
        setIsFavourite(!wasFavourite);
        // Local-first: the heart flips instantly and the request follows; only
        // a failure reverts the flip. vault:favourites-deep-dive#optimistic-revert
        const request = wasFavourite
            ? removeFavourite(tmdbId, mediaType)
            : addFavourite(tmdbId, mediaType);
        request.catch(() => {
            setIsFavourite(wasFavourite);
            toast.error(
                wasFavourite ? 'Could not remove from favourites' : 'Could not add to favourites',
            );
        });
    }

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

    const selectedEpisode = isTv
        ? seasonInfo?.episodes.find((ep) => ep.episodeNumber === episode)
        : null;
    const seasonCount = item?.seasons ?? 1;
    // Description: episode overview first, show overview as the fallback —
    // movies simply show their own overview.
    const description = selectedEpisode?.overview ?? item?.overview;

    // The description shows a few lines by default and fades out when clipped;
    // clicking it (or the hint) animates the block open to its full height —
    // the panel then scrolls internally. The block never stretches to fill
    // empty panel space; sections stack at the top of the card.
    const [descExpanded, setDescExpanded] = useState(false);
    // Full text height in px, measured once when expanding so max-height can
    // transition to the real size instead of an arbitrary cap.
    const [descMaxH, setDescMaxH] = useState(0);
    const [descOverflows, setDescOverflows] = useState(false);
    const descRef = useRef<HTMLParagraphElement>(null);

    function toggleDescription() {
        if (!descExpanded) {
            // scrollHeight reports the full text even while the block is clamped.
            setDescMaxH(descRef.current?.scrollHeight ?? 600);
        }
        setDescExpanded((v) => !v);
    }

    // A new title/episode starts with the description collapsed again.
    useEffect(() => {
        setDescExpanded(false);
        setDescMaxH(0);
    }, [description]);

    // Keeps the expanded block sized to its content on resize, and tells the
    // hint whether the collapsed view is actually clipping text.
    useEffect(() => {
        const el = descRef.current;
        if (!el) return;
        const check = () => {
            if (descExpanded) setDescMaxH(el.scrollHeight);
            setDescOverflows(el.scrollHeight > el.clientHeight + 4);
        };
        check();
        const observer = new ResizeObserver(check);
        observer.observe(el);
        return () => observer.disconnect();
    }, [description, descExpanded]);
    const activeSource = pickDefaultSource(sources ?? []);
    // The backdrop is wider than the poster — it suits the ambient glow and
    // fills the lg player surface, which is taller than 16:9.
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
                    {/* Header above the player: back, title + meta, heart. */}
                    <header className="flex items-center gap-3 py-3 sm:py-4">
                        <button
                            type="button"
                            aria-label="Back to browsing"
                            onClick={goBack}
                            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground backdrop-blur transition-colors outline-none hover:border-gold/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/60"
                        >
                            <ArrowLeft className="size-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <h1 className="font-heading truncate text-2xl font-bold tracking-tight sm:text-3xl">
                                {item.title ?? 'Untitled'}
                            </h1>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                                    {isTv ? (
                                        <>
                                            <Tv aria-hidden className="size-3" />
                                            Series
                                        </>
                                    ) : (
                                        <>
                                            <Film aria-hidden className="size-3" />
                                            Movie
                                        </>
                                    )}
                                </span>
                                {item.year != null && (
                                    <span>
                                        {item.year}
                                        {isTv &&
                                            ` · ${seasonCount} season${seasonCount === 1 ? '' : 's'}`}
                                    </span>
                                )}
                                {item.rating != null && (
                                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                        <Star
                                            aria-hidden
                                            className="size-3.5 fill-gold text-gold"
                                        />
                                        {item.rating.toFixed(1)}
                                    </span>
                                )}
                                {item.genres.length > 0 && (
                                    <span className="hidden truncate md:inline">
                                        {item.genres.join(' · ')}
                                    </span>
                                )}
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label={
                                isFavourite ? 'Remove from favourites' : 'Add to favourites'
                            }
                            aria-pressed={isFavourite}
                            onClick={toggleFavourite}
                            className={cn(
                                'flex size-11 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-all outline-none focus-visible:ring-2 focus-visible:ring-gold/60',
                                isFavourite
                                    ? 'border-gold bg-gold text-gold-foreground shadow-md'
                                    : 'border-gold bg-gold/10 text-gold hover:bg-gold/20 hover:shadow-md',
                            )}
                        >
                            <Heart
                                className={cn(
                                    'size-6 transition-transform active:scale-90',
                                    isFavourite && 'fill-gold-foreground',
                                )}
                            />
                        </button>
                    </header>

                    <div className="grid gap-5 sm:grid-cols-[1fr_280px] lg:grid-cols-[1fr_360px]">
                        {/* The player: 16:9 below lg, from lg up it fills a surface pinned
              to the viewport height so the black box is exactly the panel's
              size — the video letterboxes inside, the poster covers it all.
              Poster shows the backdrop until the first click; the layout's
              own gestures toggle play/pause. */}
                        <section aria-label="Player" className="relative lg:h-[calc(100dvh-230px)]">
                            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black shadow-xl shadow-black/20 ring-1 ring-border lg:absolute lg:inset-0 lg:aspect-auto dark:shadow-black/60">
                                {activeSource ? (
                                    <MediaPlayer
                                        // Vidstack doesn't re-init a live player when src changes
                                        // mid-session (mp4 → hls provider swap stays sourceless) —
                                        // keying by source remounts it, which also resets the
                                        // playback position as a source switch should.
                                        key={activeSource.proxyUrl}
                                        className="vds-player size-full"
                                        src={{
                                            src: absoluteProxyUrl(activeSource.proxyUrl),
                                            type:
                                                activeSource.format === 'hls'
                                                    ? 'application/x-mpegurl'
                                                    : 'video/mp4',
                                        }}
                                        crossOrigin
                                        playsInline
                                        title={`${item.title ?? 'Untitled'}${isTv ? ` · S${season}E${episode}` : ''}`}
                                    >
                                        <MediaProvider>
                                            {playerThumb && (
                                                <Poster
                                                    className="vds-poster"
                                                    src={playerThumb}
                                                    alt={item.title ?? ''}
                                                />
                                            )}
                                        </MediaProvider>
                                        {subtitleCues.length > 0 && (
                                            <CaptionOverlay
                                                cues={subtitleCues}
                                                delaySeconds={subtitleDelay / 2}
                                            />
                                        )}
                                        {(!isTv ||
                                            (resolvedCoords?.season === season &&
                                                resolvedCoords?.episode === episode)) && (
                                            <ProgressTracker
                                                key={isTv ? `s${season}e${episode}` : 'movie'}
                                                tmdbId={tmdbId}
                                                mediaType={mediaType}
                                                season={isTv ? season : undefined}
                                                episode={isTv ? episode : undefined}
                                                resumeTarget={resumeTarget}
                                                onResumeConsumed={() => setResumeTarget(null)}
                                                lastPositionRef={lastPositionRef}
                                            />
                                        )}
                                        <DefaultVideoLayout
                                            icons={defaultLayoutIcons}
                                            slots={
                                                subtitleCues.length > 0
                                                    ? {
                                                          settingsMenuItemsEnd: (
                                                              <SubtitleDelayMenu
                                                                  delay={subtitleDelay}
                                                                  onChange={setSubtitleDelay}
                                                              />
                                                          ),
                                                      }
                                                    : undefined
                                            }
                                        />
                                    </MediaPlayer>
                                ) : (
                                    <div className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground">
                                        {playerThumb && (
                                            <img
                                                src={playerThumb}
                                                alt=""
                                                className="absolute inset-0 size-full object-cover opacity-40 blur-sm"
                                            />
                                        )}
                                        {resolving ? (
                                            <LoaderCircle
                                                aria-hidden
                                                className="relative size-12 animate-spin text-gold"
                                            />
                                        ) : (
                                            <Play aria-hidden className="relative size-12" />
                                        )}
                                        <p className="relative text-sm">
                                            {resolving
                                                ? 'Resolving sources…'
                                                : sources && sources.length === 0
                                                  ? `No playable sources on ${provider}`
                                                  : 'Loading…'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Picker card: sections split by hairlines; the panel fits its
              content height instead of stretching to the player surface.
              The sm max-h cap is only a safety valve for very short windows. */}
                        <div className="flex self-start overflow-hidden rounded-2xl bg-card ring-1 ring-border sm:max-h-[calc(100dvh-210px)] sm:overflow-y-auto">
                            <div className="flex h-full w-full flex-col divide-y divide-border">
                                {isTv ? (
                                    <>
                                        {/* The chips alone pick the season — a poster + name row
                      above them would just repeat the selector. */}
                                        <div className="space-y-2 p-4">
                                            <Kicker>Season</Kicker>
                                            <div className="flex flex-wrap gap-1.5">
                                                {Array.from(
                                                    { length: seasonCount },
                                                    (_, index) => index + 1,
                                                ).map((number) => (
                                                    <button
                                                        key={number}
                                                        type="button"
                                                        aria-pressed={season === number}
                                                        onClick={() => selectSeason(number)}
                                                        className={chipClasses(season === number)}
                                                    >
                                                        S{number}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2 p-4">
                                            <Kicker>Episodes</Kicker>
                                            {episodesLoading ? (
                                                <p className="text-sm text-muted-foreground">
                                                    Loading episodes…
                                                </p>
                                            ) : (
                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] gap-1">
                                                    {(seasonInfo?.episodes ?? []).map(
                                                        (ep, index) => (
                                                            <button
                                                                key={ep.episodeNumber ?? index}
                                                                type="button"
                                                                aria-label={`Episode ${ep.episodeNumber}: ${ep.name ?? 'Untitled'}`}
                                                                aria-pressed={
                                                                    episode === ep.episodeNumber
                                                                }
                                                                title={ep.name ?? 'Untitled'}
                                                                onClick={() =>
                                                                    selectEpisode(
                                                                        ep.episodeNumber ?? 1,
                                                                    )
                                                                }
                                                                className={cn(
                                                                    'grid aspect-square place-items-center rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
                                                                    episode === ep.episodeNumber
                                                                        ? 'border-gold bg-gold font-semibold text-gold-foreground shadow-sm'
                                                                        : 'border-border text-muted-foreground hover:border-gold/50 hover:text-foreground',
                                                                )}
                                                            >
                                                                {ep.episodeNumber}
                                                            </button>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-1.5 p-4">
                                            <Kicker>Now playing</Kicker>
                                            <h2 className="font-heading text-base font-semibold tracking-tight">
                                                {selectedEpisode
                                                    ? `S${season}E${episode} · ${selectedEpisode.name ?? 'Untitled'}`
                                                    : `Season ${season}`}
                                                {selectedEpisode?.runtimeMinutes != null && (
                                                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                                                        {selectedEpisode.runtimeMinutes} min
                                                    </span>
                                                )}
                                            </h2>
                                            {description != null && (
                                                <>
                                                    <p
                                                        ref={descRef}
                                                        onClick={toggleDescription}
                                                        style={
                                                            descExpanded
                                                                ? { maxHeight: descMaxH }
                                                                : undefined
                                                        }
                                                        className={cn(
                                                            'max-h-19.5 cursor-pointer overflow-hidden text-base leading-relaxed text-muted-foreground transition-[max-height] duration-300 ease-out',
                                                            !descExpanded &&
                                                                'mask-[linear-gradient(to_bottom,black_calc(100%-28px),transparent)]',
                                                        )}
                                                    >
                                                        {description}
                                                    </p>
                                                    {(descOverflows || descExpanded) && (
                                                        <button
                                                            type="button"
                                                            aria-expanded={descExpanded}
                                                            onClick={toggleDescription}
                                                            className="self-start text-xs font-semibold text-gold transition-colors outline-none hover:underline focus-visible:ring-2 focus-visible:ring-gold/60"
                                                        >
                                                            {descExpanded
                                                                ? 'Show less'
                                                                : 'Read more'}
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col gap-1.5 p-4">
                                        <Kicker>About</Kicker>
                                        {description != null && (
                                            <>
                                                <p
                                                    ref={descRef}
                                                    onClick={toggleDescription}
                                                    style={
                                                        descExpanded
                                                            ? { maxHeight: descMaxH }
                                                            : undefined
                                                    }
                                                    className={cn(
                                                        'max-h-19.5 cursor-pointer overflow-hidden text-base leading-relaxed text-muted-foreground transition-[max-height] duration-300 ease-out',
                                                        !descExpanded &&
                                                            'mask-[linear-gradient(to_bottom,black_calc(100%-28px),transparent)]',
                                                    )}
                                                >
                                                    {description}
                                                </p>
                                                {(descOverflows || descExpanded) && (
                                                    <button
                                                        type="button"
                                                        aria-expanded={descExpanded}
                                                        onClick={toggleDescription}
                                                        className="self-start text-xs font-semibold text-gold transition-colors outline-none hover:underline focus-visible:ring-2 focus-visible:ring-gold/60"
                                                    >
                                                        {descExpanded ? 'Show less' : 'Read more'}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Sources follow the provider selection automatically. */}
                                <div className="space-y-2 p-4">
                                    <Kicker>Provider</Kicker>
                                    <div className="flex flex-wrap gap-1.5">
                                        {providers.map((name) => (
                                            <button
                                                key={name}
                                                type="button"
                                                aria-pressed={provider === name}
                                                onClick={() => selectProvider(name)}
                                                className={chipClasses(provider === name)}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
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
          search runs on Enter with the query riding along in route state. */}
            <TopNav
                wide
                tab={mediaType === 'tv' ? 'shows' : 'movies'}
                onTabChange={(tab) => navigate('/', { state: { tab } })}
                query={query}
                onQueryChange={setQuery}
                onSubmit={() => navigate('/', { state: { query } })}
                user={user}
                onLogout={onLogout}
            />
            {content}
        </div>
    );
}
