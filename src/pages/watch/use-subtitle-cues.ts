import { useEffect, useRef, useState } from 'react';
import { fetchSubtitleTrack } from '@/api/subtitles';
import { parseVtt, type VttCue } from '@/lib/vtt';
import { autoRetryWait, type WatchSelection } from './watch-selection';

const NO_CUES: VttCue[] = [];

/** Subtitles are an enhancement: one silent fetch per played title/episode, and the
 * player just runs caption-less (an empty list) when the lookup misses. */
export function useSubtitleCues(selection: WatchSelection, enabled: boolean): VttCue[] {
    const { mediaType, tmdbId, season, episode } = selection;
    const key = `${mediaType}|${tmdbId}|${season}|${episode}`;

    // Kept with the selection they were fetched for, like usePlayback's sources.
    const [loaded, setLoaded] = useState<{ key: string; cues: VttCue[] } | null>(null);
    // Bumping this re-runs the fetch after a 429's wait.
    const [retry, setRetry] = useState(0);
    const attempts = useRef({ selection: '', count: 0 });

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        fetchSubtitleTrack(mediaType, tmdbId, season, episode)
            .then((vtt) => {
                if (cancelled) return;
                attempts.current = { selection: key, count: 0 };
                setLoaded({ key, cues: vtt ? parseVtt(vtt) : NO_CUES });
            })
            .catch((error) => {
                // No captions is a graceful state — never a toast; a 429 retries silently.
                if (cancelled) return;
                const wait = autoRetryWait(error, attempts.current, key);
                if (wait !== null) {
                    retryTimer = setTimeout(() => setRetry((n) => n + 1), wait);
                }
            });
        return () => {
            cancelled = true;
            clearTimeout(retryTimer);
        };
    }, [mediaType, tmdbId, season, episode, key, enabled, retry]);

    return enabled && loaded?.key === key ? loaded.cues : NO_CUES;
}
