import { useNavigate } from 'react-router';
import { ArrowLeft, Film, Star, Tv } from 'lucide-react';
import type { MediaItem, MediaType } from '@/api/tmdb';
import FavouriteButton from './favourite-button';

interface WatchHeaderProps {
    item: MediaItem;
    mediaType: MediaType;
}

/** Header above the player: back, title + meta, heart. */
export default function WatchHeader({ item, mediaType }: WatchHeaderProps) {
    const navigate = useNavigate();
    const isTv = mediaType === 'tv';
    const seasonCount = item.seasons ?? 1;

    function goBack() {
        // Direct URL visits have no in-app history — navigate(-1) would leave the app.
        if (window.history.state?.idx) navigate(-1);
        else navigate('/');
    }

    return (
        <header className="flex items-center gap-3 py-3 sm:py-4">
            <button
                type="button"
                aria-label="Back to browsing"
                onClick={goBack}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground backdrop-blur transition-colors outline-none hover:border-gold/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/60"
            >
                <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
                <h1 className="font-heading truncate text-2xl font-bold tracking-tight sm:text-3xl">
                    {item.title ?? 'Untitled'}
                </h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                        {isTv ? (
                            <>
                                <Tv aria-hidden className="size-3" />
                                Series
                            </>
                        ) : (
                            <>
                                <Film aria-hidden className="size-3" />
                                Movie
                            </>
                        )}
                    </span>
                    {item.year != null && (
                        <span>
                            {item.year}
                            {isTv && ` · ${seasonCount} season${seasonCount === 1 ? '' : 's'}`}
                        </span>
                    )}
                    {item.rating != null && (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <Star aria-hidden className="size-3.5 fill-gold text-gold" />
                            {item.rating.toFixed(1)}
                        </span>
                    )}
                    {item.genres.length > 0 && (
                        <span className="hidden truncate md:inline">{item.genres.join(' · ')}</span>
                    )}
                </p>
            </div>
            <FavouriteButton item={{ ...item, mediaType }} />
        </header>
    );
}
