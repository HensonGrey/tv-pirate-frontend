import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchSources, type StreamSourceDto } from '@/api/stream';
import { formatWait, getErrorMessage, retryAfterMs } from '@/lib/apiError';
import { autoRetryWait, type WatchSelection } from './watch-selection';

/** Resolve-on-play: browsing episodes costs no provider calls and no video buffering.
 * Nothing resolves until play() is called, and picking another episode or provider
 * drops back to "not requested" by itself. */
export function usePlayback(provider: string | null, selection: WatchSelection) {
    const { mediaType, tmdbId, season, episode } = selection;
    const key = `${provider}|${mediaType}|${tmdbId}|${season}|${episode}`;

    const [requestedFor, setRequestedFor] = useState<string | null>(null);
    const requested = requestedFor === key;
    // Kept with the selection they were resolved for, so a stale result never reaches
    // the player — or credits its position to a newly picked episode.
    const [resolved, setResolved] = useState<{ key: string; sources: StreamSourceDto[] } | null>(
        null,
    );
    // Bumping this re-runs the resolve after a 429's wait.
    const [retry, setRetry] = useState(0);
    const attempts = useRef({ selection: '', count: 0 });

    // Cancelled runs stay silent — that's what keeps a fast chip-flip from spamming toasts.
    useEffect(() => {
        if (!provider || !requested) return;
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        fetchSources(provider, mediaType, tmdbId, season, episode)
            .then((sources) => {
                if (cancelled) return;
                attempts.current = { selection: key, count: 0 };
                setResolved({ key, sources });
            })
            .catch((error) => {
                if (cancelled) return;
                const wait = autoRetryWait(error, attempts.current, key);
                if (wait !== null) {
                    // One toast id: each retry replaces the last toast instead of stacking.
                    toast.error(`Too many requests — retrying in ${formatWait(wait)}`, {
                        id: 'resolve-retry',
                    });
                    retryTimer = setTimeout(() => setRetry((n) => n + 1), wait);
                    return; // still "resolving" until the retry lands
                }
                const tooMany = retryAfterMs(error);
                toast.error(
                    tooMany === null
                        ? getErrorMessage(error, `Could not resolve sources from ${provider}`)
                        : `Too many requests — try again in ${formatWait(tooMany)}`,
                    { id: 'resolve-retry' },
                );
                setRequestedFor(null); // back to the Play button, so it can be pressed again
            });
        return () => {
            cancelled = true;
            clearTimeout(retryTimer);
        };
    }, [provider, mediaType, tmdbId, season, episode, key, requested, retry]);

    const sources = requested && resolved?.key === key ? resolved.sources : null;

    function play() {
        setResolved(null); // a new press resolves fresh tickets, never replays old ones
        setRequestedFor(key);
    }

    return { requested, resolving: requested && sources === null, sources, play };
}
