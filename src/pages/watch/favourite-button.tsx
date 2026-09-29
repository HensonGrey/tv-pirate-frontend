import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { MediaType } from '@/api/tmdb';
import { addFavourite, fetchFavourites, removeFavourite } from '@/api/favourites';

interface FavouriteButtonProps {
    tmdbId: number;
    mediaType: MediaType;
}

/** The heart in the watch header. Seeded from the shared favourites list — the same
 * GET home reads — so it survives reloads and matches home. vault:favourites-deep-dive#schema */
export default function FavouriteButton({ tmdbId, mediaType }: FavouriteButtonProps) {
    const [isFavourite, setIsFavourite] = useState(false);

    useEffect(() => {
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

    function toggle() {
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

    return (
        <button
            type="button"
            aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={isFavourite}
            onClick={toggle}
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
    );
}
