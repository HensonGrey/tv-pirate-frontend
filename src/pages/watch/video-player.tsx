import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import '@vidstack/react/player/styles/default/gestures.css';

import { useState, type RefObject } from 'react';
import { MediaPlayer, MediaProvider, Poster } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import CaptionOverlay from '@/components/caption-overlay';
import ProgressTracker from '@/components/progress-tracker';
import SubtitleDelayMenu from '@/components/subtitle-delay-menu';
import { absoluteProxyUrl, type StreamSourceDto } from '@/api/stream';
import type { VttCue } from '@/lib/vtt';
import type { WatchSelection } from './watch-selection';

interface VideoPlayerProps {
    source: StreamSourceDto;
    selection: WatchSelection;
    title: string;
    posterUrl: string | null;
    cues: VttCue[];
    resumeTarget: number | null;
    onResumeConsumed: () => void;
    lastPositionRef: RefObject<number>;
    playingRef: RefObject<boolean>;
}

/** The video itself: vidstack's player with its controls, the captions, the subtitle
 * delay menu and the progress tracker. It only exists inside PlayerSection once a
 * stream has been resolved, and doesn't fetch anything.
 *
 * Render it with key={source.proxyUrl}, so each stream gets a fresh player: vidstack
 * doesn't re-init when src changes mid-session (an mp4 → hls swap stays sourceless),
 * and a fresh one also starts the position and the subtitle delay over. */
export default function VideoPlayer({
    source,
    selection,
    title,
    posterUrl,
    cues,
    resumeTarget,
    onResumeConsumed,
    lastPositionRef,
    playingRef,
}: VideoPlayerProps) {
    // Manual sync shift in half-second ticks: every sub file is timed to its
    // own release, so a constant offset against the stream is normal —
    // positive = delay the track. Ticks keep the 0.5s steps float-drift-free.
    const [subtitleDelay, setSubtitleDelay] = useState(0);

    return (
        <MediaPlayer
            // Mounted only after Play was pressed, so it starts by itself.
            autoPlay
            className="vds-player size-full"
            src={{
                src: absoluteProxyUrl(source.proxyUrl),
                type: source.format === 'hls' ? 'application/x-mpegurl' : 'video/mp4',
            }}
            crossOrigin
            playsInline
            title={title}
        >
            <MediaProvider>
                {posterUrl && <Poster className="vds-poster" src={posterUrl} alt={title} />}
            </MediaProvider>
            {cues.length > 0 && <CaptionOverlay cues={cues} delaySeconds={subtitleDelay / 2} />}
            <ProgressTracker
                tmdbId={selection.tmdbId}
                mediaType={selection.mediaType}
                season={selection.season}
                episode={selection.episode}
                resumeTarget={resumeTarget}
                onResumeConsumed={onResumeConsumed}
                lastPositionRef={lastPositionRef}
                playingRef={playingRef}
            />
            <DefaultVideoLayout
                icons={defaultLayoutIcons}
                slots={
                    cues.length > 0
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
    );
}
