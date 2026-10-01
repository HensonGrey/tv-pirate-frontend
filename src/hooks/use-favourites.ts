import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    addFavourite,
    fetchFavourites,
    removeFavourite,
    type FavouriteRow,
} from '@/api/favourites';
import type { MediaItem } from '@/api/tmdb';
import { LoadStatusEnum } from '@/lib/loadStatusEnum';
import { titleKey } from '@/lib/titleKey';

/** The user's favourites: one list that every heart and the Library read. The watch page
 * reads the same GET, so both pages stay in sync with the server. reload() re-fetches
 * it quietly (also the retry after a failed first load). */
export function useFavourites() {
    const [rows, setRows] = useState<FavouriteRow[]>([]);
    const [status, setStatus] = useState<LoadStatusEnum>(LoadStatusEnum.Loading);
    const [reloadKey, setReloadKey] = useState(0);
    // Rapid like/unlike clicking: dismiss the previous toast so the stack doesn't pile up.
    const toastId = useRef<string | number | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchFavourites()
            .then((loaded) => {
                if (cancelled) return;
                setRows(loaded);
                setStatus(LoadStatusEnum.Ready);
            })
            .catch(() => {
                // Hearts read as unliked; a list we already have stays as it was.
                if (!cancelled)
                    setStatus((current) =>
                        current === LoadStatusEnum.Ready ? current : LoadStatusEnum.Failed,
                    );
            });
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    const keys = useMemo(
        () => new Set(rows.map((row) => titleKey(row.mediaType, row.tmdbId))),
        [rows],
    );

    function reload() {
        setStatus((current) =>
            current === LoadStatusEnum.Failed ? LoadStatusEnum.Loading : current,
        );
        setReloadKey((key) => key + 1);
    }

    /** Local-first: the heart flips instantly and the request follows; only a failure
     * flips it back and says so. vault:favourites-deep-dive#optimistic-revert */
    function toggle(item: MediaItem) {
        if (!item.mediaType) return;
        const row: FavouriteRow = { tmdbId: item.id, mediaType: item.mediaType };
        const key = titleKey(row.mediaType, row.tmdbId);
        const wasFavourite = keys.has(key);
        const name = `“${item.title ?? 'Untitled'}”`;

        setRows((current) => (wasFavourite ? without(current, key) : [...current, row]));

        const request = wasFavourite
            ? removeFavourite(row.tmdbId, row.mediaType)
            : addFavourite(row.tmdbId, row.mediaType);
        request.catch(() => {
            // Undo just this change, so a later click made meanwhile survives.
            setRows((current) => (wasFavourite ? [...current, row] : without(current, key)));
            toast.error(`Could not ${wasFavourite ? 'remove' : 'add'} ${name}`);
        });

        if (toastId.current !== null) toast.dismiss(toastId.current);
        toastId.current = wasFavourite
            ? toast(`Removed ${name} from your list`)
            : toast.success(`Added ${name} to your list`);
    }

    return { rows, keys, status, reload, toggle };
}

function without(rows: FavouriteRow[], key: string): FavouriteRow[] {
    return rows.filter((row) => titleKey(row.mediaType, row.tmdbId) !== key);
}
