import type { ReactNode } from 'react';
import { Film, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaType } from '@/api/tmdb';

// Full class strings, not built ones — Tailwind only ships classes it can see.
const LOOK = {
    movie: {
        label: 'Movies',
        empty: 'No movies on this page — try the next one.',
        icon: Film,
        box: 'border-movie/40 bg-movie/8 [--row-accent:var(--movie)]',
        badge: 'bg-movie/15 text-movie',
    },
    tv: {
        label: 'Shows',
        empty: 'No shows on this page — try the next one.',
        icon: Tv,
        box: 'border-show/40 bg-show/8 [--row-accent:var(--show)]',
        badge: 'bg-show/15 text-show',
    },
};

interface MediaSectionProps {
    mediaType: MediaType;
    /** Titles of this type on the page; 0 shows the "try the next one" line. */
    count: number;
    children: ReactNode;
}

/** One media type's half of a mixed results page, boxed and tinted in its
 * own colour so Movies and Shows read as separate groups at a glance. */
export default function MediaSection({ mediaType, count, children }: MediaSectionProps) {
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
                <span className="text-sm font-normal text-muted-foreground">{count}</span>
            </h3>
            {count > 0 ? (
                children
            ) : (
                <p className="mt-3 text-sm text-muted-foreground">{look.empty}</p>
            )}
        </section>
    );
}
