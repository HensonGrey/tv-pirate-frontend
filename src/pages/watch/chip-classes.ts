import { cn } from '@/lib/utils';

/** Shared pill styling for season + provider chips — selected is solid gold,
 * the rest stay quiet outlines. */
export function chipClasses(selected: boolean) {
    return cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
        selected
            ? 'border-gold bg-gold font-semibold text-gold-foreground shadow-sm'
            : 'border-border text-muted-foreground hover:border-gold/50 hover:text-foreground',
    );
}
