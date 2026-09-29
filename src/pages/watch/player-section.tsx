import type { RefObject } from 'react';
import { LoaderCircle, Play } from 'lucide-react';
import type { MediaItem } from '@/api/tmdb';
import type { StreamSourceDto } from '@/api/stream';
import VideoPlayer from './video-player';
import { usePlayback } from './use-playback';
import { useSubtitleCues } from './use-subtitle-cues';
import type { WatchSelection } from './watch-selection';

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

interface PlayerSectionProps {
    item: MediaItem;
    provider: string | null;
    selection: WatchSelection;
    resumeTarget: number | null;
    onResumeConsumed: () => void;
    lastPositionRef: RefObject<number>;
}

/** The black box on the page where the video goes. It decides what the box shows:
 *   1. the Play button (nothing is fetched until it's pressed),
 *   2. a spinner while the provider resolves the stream,
 *   3. "No playable sources" if the provider came back empty,
 *   4. the actual video, as a VideoPlayer, once there's a stream.
 * It runs the fetching (usePlayback, useSubtitleCues); VideoPlayer only plays. */
export default function PlayerSection({
    item,
    provider,
    selection,
    resumeTarget,
    onResumeConsumed,
    lastPositionRef,
}: PlayerSectionProps) {
    const playback = usePlayback(provider, selection);
    const cues = useSubtitleCues(selection, playback.requested);

    const source = pickDefaultSource(playback.sources ?? []);
    const episodeLabel =
        selection.season != null ? `S${selection.season}E${selection.episode}` : null;
    // The backdrop is wider than the poster — it fills the lg surface, which is taller than 16:9.
    const thumb = item.backdropUrl ?? item.posterUrl;

    // 16:9 below lg; from lg up the box is pinned to the viewport height, so it matches
    // the picker card and the video letterboxes inside it.
    return (
        <section aria-label="Player" className="relative lg:h-[calc(100dvh-230px)]">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black shadow-xl shadow-black/20 ring-1 ring-border lg:absolute lg:inset-0 lg:aspect-auto dark:shadow-black/60">
                {source ? (
                    <VideoPlayer
                        key={source.proxyUrl}
                        source={source}
                        selection={selection}
                        title={`${item.title ?? 'Untitled'}${episodeLabel ? ` · ${episodeLabel}` : ''}`}
                        posterUrl={thumb}
                        cues={cues}
                        resumeTarget={resumeTarget}
                        onResumeConsumed={onResumeConsumed}
                        lastPositionRef={lastPositionRef}
                    />
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground">
                        {thumb && (
                            <img
                                src={thumb}
                                alt=""
                                className="absolute inset-0 size-full object-cover opacity-40 blur-sm"
                            />
                        )}
                        {!playback.requested ? (
                            <button
                                type="button"
                                disabled={!provider}
                                onClick={playback.play}
                                className="relative flex flex-col items-center gap-3 rounded-2xl p-4 text-foreground transition-colors outline-none hover:text-gold focus-visible:ring-3 focus-visible:ring-gold/60 disabled:opacity-50"
                            >
                                <Play aria-hidden className="size-14" />
                                <span className="text-sm font-medium">
                                    {episodeLabel ? `Play ${episodeLabel}` : 'Play'}
                                </span>
                            </button>
                        ) : playback.resolving ? (
                            <>
                                <LoaderCircle
                                    aria-hidden
                                    className="relative size-12 animate-spin text-gold"
                                />
                                <p className="relative text-sm">Resolving sources…</p>
                            </>
                        ) : (
                            <>
                                <Play aria-hidden className="relative size-12" />
                                <p className="relative text-sm">
                                    No playable sources on {provider}
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
