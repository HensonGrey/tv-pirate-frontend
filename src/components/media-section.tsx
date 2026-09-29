import type { ReactNode } from 'react';
import { Film, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaType } from '@/api/tmdb';

// Full class strings, not built ones — Tailwind only ships classes it can see.
const LOOK = {
    movie: {
        label: 'Movies',
        empty: 'No movies match.',
        icon: Film,
        box: '[--row-accent:var(--movie)]',
        title: 'text-movie',
    },
    tv: {
        label: 'Shows',
        empty: 'No shows match.',
        icon: Tv,
        box: '[--row-accent:var(--show)]',
        title: 'text-show',
    },
};

interface MediaSectionProps {
    mediaType: MediaType;
    count: number;
    /** Loaded, and nothing matched: the empty line replaces the row. */
    empty: boolean;
    children: ReactNode;
}

/** One media type's half of a mixed results page. No box — the cards sit on
 * the page, and the header (accent-coloured title, rule, count) tells Movies
 * and Shows apart. */
export default function MediaSection({ mediaType, count, empty, children }: MediaSectionProps) {
    const look = LOOK[mediaType];
    const Icon = look.icon;
    return (
        <section aria-label={look.label} className={look.box}>
            <h3 className="flex items-center gap-3">
                <span
                    className={cn(
                        'flex items-center gap-2 font-heading text-xl font-bold tracking-tight',
                        look.title,
                    )}
                >
                    <Icon aria-hidden className="size-5" />
                    {look.label}
                </span>
                {count > 0 && (
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {count} titles
                    </span>
                )}
                <span aria-hidden className="h-px flex-1 bg-border" />
            </h3>
            {empty ? (
                <p className="mt-3 text-sm text-muted-foreground">{look.empty}</p>
            ) : (
                <div className="mt-4">{children}</div>
            )}
        </section>
    );
}
