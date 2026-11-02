import { Film, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import { titleKey } from '@/lib/titleKey';
import type { MediaItem } from '@/api/tmdb';

interface SearchSuggestionsProps {
    /** The listbox's id; row n is `${id}-${n}`, which the input names as its active descendant. */
    id: string;
    items: MediaItem[];
    /** The row the arrow keys are on; -1 = none. */
    active: number;
    onPick: (item: MediaItem) => void;
}

/** The dropdown under the nav's search box. Focus never leaves the input: the arrow
 * keys move `active`, and the input points at that row (aria-activedescendant). */
export default function SearchSuggestions({ id, items, active, onPick }: SearchSuggestionsProps) {
    return (
        <ul
            id={id}
            role="listbox"
            aria-label="Matching titles"
            // Pressing a row would blur the input, and the list would close before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            className="absolute inset-x-0 top-full z-50 mt-1 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
            {items.map((item, index) => {
                const isTv = item.mediaType === 'tv';
                const TypeIcon = isTv ? Tv : Film;
                return (
                    <li
                        key={titleKey(item.mediaType ?? '', item.id)}
                        id={`${id}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onClick={() => onPick(item)}
                        className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-lg p-1.5 hover:bg-muted',
                            index === active && 'bg-muted',
                        )}
                    >
                        {/* The box holds the poster's place until it loads, or the type icon if there is none. */}
                        <span className="flex aspect-2/3 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-foreground/10 text-muted-foreground">
                            {item.posterUrl ? (
                                <img
                                    src={item.posterUrl}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="size-full object-cover"
                                />
                            ) : (
                                <TypeIcon aria-hidden className="size-4" />
                            )}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                                {item.title ?? 'Untitled'}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                                {[isTv ? 'Series' : 'Movie', item.year].filter(Boolean).join(' · ')}
                            </span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
