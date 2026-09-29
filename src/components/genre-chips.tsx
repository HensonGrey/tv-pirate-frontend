import { cn } from '@/lib/utils';
import type { GenreInfo } from '@/api/tmdb';

interface GenreChipsProps {
    genreList: GenreInfo[];
    selected: Set<string>;
    onToggle: (name: string) => void;
    onClear: () => void;
}

function chipClasses(pressed: boolean) {
    return cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
        pressed
            ? 'border-gold bg-gold/15 text-gold'
            : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
    );
}

/** The genre filter on the Browse tab. Multi-select: click to toggle, several genres
 * stack up; "All genres" clears them. */
export default function GenreChips({ genreList, selected, onToggle, onClear }: GenreChipsProps) {
    return (
        <div className="flex flex-wrap gap-2">
            <button
                type="button"
                aria-pressed={selected.size === 0}
                onClick={onClear}
                className={chipClasses(selected.size === 0)}
            >
                All genres
            </button>
            {genreList.map((genre) => (
                <button
                    key={genre.name}
                    type="button"
                    aria-pressed={selected.has(genre.name)}
                    onClick={() => onToggle(genre.name)}
                    className={chipClasses(selected.has(genre.name))}
                >
                    {genre.name}
                </button>
            ))}
        </div>
    );
}
