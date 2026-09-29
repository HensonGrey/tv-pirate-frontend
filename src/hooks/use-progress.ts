import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { clearProgress, fetchProgress, type ProgressRow } from '@/api/progress';
import type { MediaType } from '@/api/tmdb';
import { LoadStatus } from '@/lib/loadStatus';
import { titleKey } from '@/lib/titleKey';

/** The user's saved watch positions: one list that the modal's bar and the Library's
 * Continue watching both read. A show has a row for each episode watched. reload()
 * re-fetches it quietly (also the retry after a failed first load). */
export function useProgress() {
    // Newest first, as the backend sends them.
    const [rows, setRows] = useState<ProgressRow[]>([]);
    const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchProgress()
            .then((loaded) => {
                if (cancelled) return;
                setRows(loaded);
                setStatus(LoadStatus.Ready);
            })
            .catch(() => {
                // No bars is a graceful state; a list we already have stays as it was.
                if (!cancelled)
                    setStatus((current) =>
                        current === LoadStatus.Ready ? current : LoadStatus.Failed,
                    );
            });
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    /** The newest row per title, which is the one the modal's bar shows. */
    const latestByTitle = useMemo(() => {
        const latest = new Map<string, ProgressRow>();
        for (const row of rows) {
            const key = titleKey(row.mediaType, row.tmdbId);
            if (!latest.has(key)) latest.set(key, row);
        }
        return latest;
    }, [rows]);

    function reload() {
        setStatus((current) => (current === LoadStatus.Failed ? LoadStatus.Loading : current));
        setReloadKey((key) => key + 1);
    }

    /** "Start over": every saved row for the title goes (a show restarts from S1E1).
     * Optimistic — the cards drop it at once, and a failure puts the rows back. */
    function clear(mediaType: MediaType, tmdbId: number) {
        const key = titleKey(mediaType, tmdbId);
        const isTitle = (row: ProgressRow) => titleKey(row.mediaType, row.tmdbId) === key;
        const removed = rows.filter(isTitle);

        setRows((current) => current.filter((row) => !isTitle(row)));
        clearProgress(mediaType, tmdbId).catch(() => {
            setRows((current) =>
                [...current, ...removed].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
            );
            toast.error('Could not clear progress');
        });
    }

    return { rows, latestByTitle, status, reload, clear };
}
