import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { fetchSubtitleTrack } from '@/api/subtitles';
import { formatWait, getErrorMessage, retryAfterMs } from '@/lib/apiError';
import { parseVtt, type VttCue } from '@/lib/vtt';
import { autoRetryWait, type WatchSelection } from './watch-selection';

const NO_CUES: VttCue[] = [];

/** Subtitles are an enhancement: one fetch per played title/episode, and the player just
 * runs caption-less (an empty list) when the lookup fails. A clean miss gets a plain toast
 * and a real failure an error toast, at most one either way. */
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
                // Captions are optional, so a miss is a notice, not an error. A 429 retries
                // silently first; one toast id keeps a repeat play from stacking toasts.
                if (cancelled) return;
                const wait = autoRetryWait(error, attempts.current, key);
                if (wait !== null) {
                    retryTimer = setTimeout(() => setRetry((n) => n + 1), wait);
                    return;
                }
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    toast('No subtitles found for this episode', { id: 'subtitles' });
                    return;
                }
                const tooMany = retryAfterMs(error);
                toast.error(
                    tooMany === null
                        ? getErrorMessage(error, 'Could not load subtitles')
                        : `Too many requests — try again in ${formatWait(tooMany)}`,
                    { id: 'subtitles' },
                );
            });
        return () => {
            cancelled = true;
            clearTimeout(retryTimer);
        };
    }, [mediaType, tmdbId, season, episode, key, enabled, retry]);

    return enabled && loaded?.key === key ? loaded.cues : NO_CUES;
}
