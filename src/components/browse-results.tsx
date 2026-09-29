import type { ReactNode } from 'react';
import { Skull, WifiOff } from 'lucide-react';
import MediaRow from '@/components/media-row';
import MediaSection from '@/components/media-section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MediaItem, MediaType } from '@/api/tmdb';
import type { TitleList } from '@/hooks/use-title-list';

interface BrowseResultsProps {
    movies: TitleList;
    shows: TitleList;
    /** Nothing is being fetched (the lists are idle): treat them as empty. */
    idle: boolean;
    searching: boolean;
    /** The trimmed search text, for the "nothing matches" message. */
    query: string;
    /** Changes whenever the result set does; remounts the rows so they start scrolled left. */
    resetKey: string;
    onSelect: (item: MediaItem) => void;
    onClearFilters: () => void;
}

/** Icon, heading, text and one button: the layout of both "nothing to show" states. */
function Notice({
    icon,
    title,
    children,
    action,
}: {
    icon: ReactNode;
    title: string;
    children: ReactNode;
    action: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
            {icon}
            <p className="font-heading text-lg font-semibold">{title}</p>
            <p className="max-w-sm text-base text-muted-foreground">{children}</p>
            {action}
        </div>
    );
}

/** What the Browse tab shows under the filters: an error, "nothing found", or the
 * Shows and Movies rows. Previous results stay visible (dimmed) while a refetch
 * runs; an empty row shows placeholder cards instead. */
export default function BrowseResults({
    movies,
    shows,
    idle,
    searching,
    query,
    resetKey,
    onSelect,
    onClearFilters,
}: BrowseResultsProps) {
    const lists = idle ? [] : [movies, shows];
    const anyItems = lists.some((list) => list.items.length > 0);
    const refreshing = lists.some((list) => list.loading);

    if (lists.length > 0 && lists.every((list) => list.failed)) {
        return (
            <Notice
                icon={<WifiOff aria-hidden className="size-10 text-muted-foreground" />}
                title="Shore leave — the signal's down"
                action={
                    <Button variant="outline" onClick={() => lists.forEach((list) => list.retry())}>
                        Try again
                    </Button>
                }
            >
                Couldn't load titles. The server may be busy — try again in a moment.
            </Notice>
        );
    }

    if (!anyItems && lists.every((list) => !list.loading && !list.failed)) {
        return (
            <Notice
                icon={<Skull aria-hidden className="size-10 text-muted-foreground" />}
                title="No treasure found"
                action={
                    <Button variant="outline" onClick={onClearFilters}>
                        Clear filters
                    </Button>
                }
            >
                {searching
                    ? `Nothing matches “${query}”. Try a different title, or clear the filters.`
                    : 'Nothing matches these filters. Loosen them up and cast another net.'}
            </Notice>
        );
    }

    const row = (mediaType: MediaType, list: TitleList) => (
        <MediaSection
            mediaType={mediaType}
            count={list.items.length}
            empty={list.items.length === 0 && !list.loading && !list.failed}
        >
            <MediaRow key={resetKey} list={list} onSelect={onSelect} />
        </MediaSection>
    );

    return (
        <div
            aria-busy={refreshing}
            className={cn('transition-opacity', refreshing && anyItems && 'opacity-60')}
        >
            <div className="space-y-6">
                {row('tv', shows)}
                {row('movie', movies)}
            </div>
        </div>
    );
}
