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
        box: 'border-movie/40 bg-movie/8 [--row-accent:var(--movie)]',
        badge: 'bg-movie/15 text-movie',
    },
    tv: {
        label: 'Shows',
        empty: 'No shows match.',
        icon: Tv,
        box: 'border-show/40 bg-show/8 [--row-accent:var(--show)]',
        badge: 'bg-show/15 text-show',
    },
};

interface MediaSectionProps {
    mediaType: MediaType;
    count: number;
    /** Loaded, and nothing matched: the empty line replaces the row. */
    empty: boolean;
    children: ReactNode;
}

/** One media type's half of a mixed results page, boxed and tinted in its
 * own colour so Movies and Shows read as separate groups at a glance. */
export default function MediaSection({ mediaType, count, empty, children }: MediaSectionProps) {
    const look = LOOK[mediaType];
    const Icon = look.icon;
    return (
        <section aria-label={look.label} className={cn('rounded-2xl border p-4 sm:p-5', look.box)}>
            <h3 className="flex items-center gap-2.5 font-heading text-base font-semibold tracking-tight">
                <span
                    aria-hidden
                    className={cn('flex size-7 items-center justify-center rounded-lg', look.badge)}
                >
                    <Icon className="size-4" />
                </span>
                {look.label}
                {count > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">{count}</span>
                )}
            </h3>
            {empty ? <p className="mt-3 text-sm text-muted-foreground">{look.empty}</p> : children}
        </section>
    );
}
