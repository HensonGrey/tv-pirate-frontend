import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaItem } from '@/api/tmdb';
import { useFavourites } from '@/hooks/use-favourites';
import { titleKey } from '@/lib/titleKey';

interface FavouriteButtonProps {
    item: MediaItem;
}

/** The heart in the watch header. It reads the shared favourites list, so it matches home
 * and follows other devices. vault:favourites-deep-dive#schema */
export default function FavouriteButton({ item }: FavouriteButtonProps) {
    const favourites = useFavourites();
    const isFavourite =
        item.mediaType != null && favourites.keys.has(titleKey(item.mediaType, item.id));

    return (
        <button
            type="button"
            aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={isFavourite}
            onClick={() => favourites.toggle(item)}
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
