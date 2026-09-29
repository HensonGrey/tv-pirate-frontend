import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import MediaModal from '@/components/media-modal';
import { fetchTitleDetail, type MediaItem } from '@/api/tmdb';
import type { ProgressRow } from '@/api/progress';
import { watchPath } from '@/lib/watchPath';

interface MediaModalContainerProps {
    /** The list item that was clicked; it opens the modal instantly. */
    selected: MediaItem;
    isFavourite: boolean;
    /** The user's saved progress for this title, if any. */
    progressRow: ProgressRow | undefined;
    onToggleFavourite: (item: MediaItem) => void;
    onStartOver: (item: MediaItem) => void;
    onClose: () => void;
}

/** Wraps MediaModal, which only draws the dialog: this one loads the title's full detail,
 * turns saved progress into a percentage, and sends "Watch" to the watch page.
 * Render it with key={mediaType:id}, so a different title starts from a fresh state. */
export default function MediaModalContainer({
    selected,
    isFavourite,
    progressRow,
    onToggleFavourite,
    onStartOver,
    onClose,
}: MediaModalContainerProps) {
    const navigate = useNavigate();
    // Runtime and seasons arrive behind the modal; until then it shows the list item.
    const [detail, setDetail] = useState<MediaItem | null>(null);

    // Closing the modal unmounts this, and a late answer is dropped.
    useEffect(() => {
        if (selected.mediaType == null) return;
        let cancelled = false;
        fetchTitleDetail(selected.mediaType, selected.id)
            .then((loaded) => {
                if (!cancelled) setDetail(loaded);
            })
            .catch(() => {
                if (!cancelled) toast.error('Could not load full details');
            });
        return () => {
            cancelled = true;
        };
    }, [selected.mediaType, selected.id]);

    const shown = detail ?? selected;
    const progressPct =
        progressRow?.durationSeconds != null
            ? Math.round((progressRow.progressSeconds / progressRow.durationSeconds) * 100)
            : undefined;

    return (
        <MediaModal
            item={{
                ...shown,
                progress: progressPct,
                progressSeason: progressRow?.season ?? undefined,
                progressEpisode: progressRow?.episode ?? undefined,
            }}
            isFavourite={isFavourite}
            onToggleFavourite={() => onToggleFavourite(selected)}
            onWatch={() => {
                if (shown.mediaType == null) return;
                navigate(watchPath(shown.mediaType, shown.id, shown.title));
            }}
            onStartOver={() => onStartOver(shown)}
            onClose={onClose}
        />
    );
}
