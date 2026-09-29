import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import '@vidstack/react/player/styles/default/gestures.css';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LoaderCircle, Play, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { MediaPlayer, MediaProvider, Poster } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { Button } from '@/components/ui/button';
import TopNav from '@/components/top-nav';
import CaptionOverlay from '@/components/caption-overlay';
import Kicker from '@/components/kicker';
import ProgressTracker from '@/components/progress-tracker';
import SubtitleDelayMenu from '@/components/subtitle-delay-menu';
import { fetchTitleDetail, type MediaItem, type MediaType } from '@/api/tmdb';
import { absoluteProxyUrl, fetchSources, type StreamSourceDto } from '@/api/stream';
import { fetchSubtitleTrack } from '@/api/subtitles';
import { fetchProgress, type ProgressRow } from '@/api/progress';
import { parseVtt, type VttCue } from '@/lib/vtt';
import { getPreferredProvider } from '@/lib/providerPreference';
import { formatWait, retryAfterMs } from '@/lib/apiError';
import type { StoredUser } from '@/lib/authStorage';
import ExpandableDescription from './expandable-description';
import EpisodePanel from './episode-panel';
import ProviderPicker from './provider-picker';
import WatchHeader from './watch-header';

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

const MAX_AUTO_RETRIES = 3;
const MAX_AUTO_RETRY_WAIT_MS = 60_000;

/** A 429 re-runs its effect once Retry-After has passed: up to 3 times per selection, and
 * only for short waits. Returns the wait in ms, or null to give up. vault:rate-limiting-deep-dive#frontend */
function autoRetryWait(
    error: unknown,
    attempts: { selection: string; count: number },
    selection: string,
): number | null {
    if (attempts.selection !== selection) {
        attempts.selection = selection;
        attempts.count = 0;
    }
    const wait = retryAfterMs(error);
    if (wait === null || wait > MAX_AUTO_RETRY_WAIT_MS || attempts.count >= MAX_AUTO_RETRIES) {
        return null;
    }
    attempts.count++;
    return wait;
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

    const [resolving, setResolving] = useState(false);
    const [sources, setSources] = useState<StreamSourceDto[] | null>(null);
    // Nothing resolves until Play: this holds the selection Play was pressed for, so
    // picking another episode or provider drops back to the Play button by itself.
    const [playRequestedFor, setPlayRequestedFor] = useState<string | null>(null);
    const playSelection = `${tmdbId}|${provider}|${season}|${episode}`;
    const playRequested = playRequestedFor === playSelection;
    // Parsed caption cues for the current title/episode (empty = no captions).
    const [subtitleCues, setSubtitleCues] = useState<VttCue[]>([]);
    // Manual sync shift in half-second ticks: every sub file is timed to its
    // own release, so a constant offset against the stream is normal —
    // positive = delay the track. Ticks keep the 0.5s steps float-drift-free.
    const [subtitleDelay, setSubtitleDelay] = useState(0);

    // Live position shared with ProgressTracker: a provider switch remounts
    // the player and continues from here.
    const lastPositionRef = useRef(0);
    // Bumping these re-runs the resolve / subtitle effect after a 429's wait.
    const [resolveRetry, setResolveRetry] = useState(0);
    const [subtitleRetry, setSubtitleRetry] = useState(0);
    const resolveAttempts = useRef({ selection: '', count: 0 });
    const subtitleAttempts = useRef({ selection: '', count: 0 });

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

    // Resolve-on-play: browsing episodes costs no provider calls and no video buffering.
    // Cancelled runs stay silent — that's what keeps a fast chip-flip from spamming toasts.
    useEffect(() => {
        if (!provider || !item || !playRequested) {
            setSources(null);
            return;
        }
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        const selection = `${provider}|${season}|${episode}`;
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
                resolveAttempts.current = { selection, count: 0 };
                setSources(result);
                setResolvedCoords(isTv ? { season, episode } : null);
                setResolving(false);
            })
            .catch((error) => {
                if (cancelled) return;
                const wait = autoRetryWait(error, resolveAttempts.current, selection);
                if (wait !== null) {
                    // One toast id: each retry replaces the last toast instead of stacking.
                    toast.error(`Too many requests — retrying in ${formatWait(wait)}`, {
                        id: 'resolve-retry',
                    });
                    retryTimer = setTimeout(() => setResolveRetry((n) => n + 1), wait);
                    return; // the spinner stays until the retry lands
                }
                const tooMany = retryAfterMs(error);
                toast.error(
                    tooMany === null
                        ? `Could not resolve sources from ${provider}`
                        : `Too many requests — try again in ${formatWait(tooMany)}`,
                    { id: 'resolve-retry' },
                );
                setResolving(false);
                setPlayRequestedFor(null); // back to the Play button, so it can be pressed again
            });
        return () => {
            cancelled = true;
            clearTimeout(retryTimer);
        };
    }, [provider, item, mediaType, tmdbId, isTv, season, episode, resolveRetry, playRequested]);

    // Subtitles are an enhancement: one silent fetch per played title/episode, and
    // the player just runs caption-less when the lookup misses.
    useEffect(() => {
        if (!item || !playRequested) return;
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        const selection = `${tmdbId}|${season}|${episode}`;
        setSubtitleCues([]);
        setSubtitleDelay(0); // a new file is a new release — its own offset
        fetchSubtitleTrack(mediaType, tmdbId, isTv ? season : undefined, isTv ? episode : undefined)
            .then((vtt) => {
                if (cancelled) return;
                subtitleAttempts.current = { selection, count: 0 };
                if (vtt) setSubtitleCues(parseVtt(vtt));
            })
            .catch((error) => {
                // No captions is a graceful state — never a toast; a 429 retries silently.
                if (cancelled) return;
                const wait = autoRetryWait(error, subtitleAttempts.current, selection);
                if (wait !== null) {
                    retryTimer = setTimeout(() => setSubtitleRetry((n) => n + 1), wait);
                }
            });
        return () => {
            cancelled = true;
            clearTimeout(retryTimer);
        };
    }, [mediaType, tmdbId, isTv, season, episode, item, subtitleRetry, playRequested]);

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
                    <WatchHeader item={item} mediaType={mediaType} />

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
                                        // Mounted only after Play was pressed, so it starts by itself.
                                        autoPlay
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
                                        {!playRequested ? (
                                            <button
                                                type="button"
                                                disabled={!provider}
                                                onClick={() => setPlayRequestedFor(playSelection)}
                                                className="relative flex flex-col items-center gap-3 rounded-2xl p-4 text-foreground transition-colors outline-none hover:text-gold focus-visible:ring-3 focus-visible:ring-gold/60 disabled:opacity-50"
                                            >
                                                <Play aria-hidden className="size-14" />
                                                <span className="text-sm font-medium">
                                                    {isTv ? `Play S${season}E${episode}` : 'Play'}
                                                </span>
                                            </button>
                                        ) : (
                                            <>
                                                {resolving ? (
                                                    <LoaderCircle
                                                        aria-hidden
                                                        className="relative size-12 animate-spin text-gold"
                                                    />
                                                ) : (
                                                    <Play
                                                        aria-hidden
                                                        className="relative size-12"
                                                    />
                                                )}
                                                <p className="relative text-sm">
                                                    {resolving
                                                        ? 'Resolving sources…'
                                                        : sources && sources.length === 0
                                                          ? `No playable sources on ${provider}`
                                                          : 'Loading…'}
                                                </p>
                                            </>
                                        )}
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
