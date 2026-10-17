import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import MediaCard from '@/components/media-card';
import type { MediaItem } from '@/api/tmdb';
import type { TitleList } from '@/hooks/use-title-list';

/** Cards kept in the DOM; the rest become spacers. ~2.5 screens even at 4K. */
const WINDOW_CARDS = 60;
/** Of those, how many stay rendered behind the scroll position. */
const BEHIND_CARDS = 20;
/** The next page loads once you scroll within this many cards of the end. */
const LOAD_AHEAD_CARDS = 5;
/** The flex gap (gap-4), in px. */
const GAP_PX = 16;

// grid-cols-1 (minmax(0)) keeps a long title from widening its card.
const CELL = 'grid w-(--card-w) shrink-0 grid-cols-1 snap-start';

function cardStep(row: HTMLElement): number | null {
    const card = row.querySelector<HTMLElement>('[data-card]');
    return card ? card.offsetWidth + GAP_PX : null;
}

/** Index of the first card to render: BEHIND_CARDS before the one at the left edge. */
function firstRenderedIndex(row: HTMLElement): number {
    const step = cardStep(row);
    if (!step) return 0;
    return Math.max(0, Math.floor(row.scrollLeft / step) - BEHIND_CARDS);
}

/** True within LOAD_AHEAD_CARDS of the end — also for a row too short to scroll. */
function isNearEnd(row: HTMLElement): boolean {
    const step = cardStep(row);
    if (!step) return false;
    return row.scrollWidth - row.scrollLeft - row.clientWidth < LOAD_AHEAD_CARDS * step;
}

/** Stands in for `count` unrendered cards, so the scroll width stays put. */
function Spacer({ count }: { count: number }) {
    if (count <= 0) return null;
    return (
        <div
            aria-hidden
            className="shrink-0"
            style={{ width: `calc(${count} * (var(--card-w) + ${GAP_PX}px) - ${GAP_PX}px)` }}
        />
    );
}

function Placeholder() {
    return (
        <div aria-hidden className={CELL}>
            <div className="relative aspect-2/3 overflow-hidden rounded-xl bg-muted/60">
                <span className="absolute inset-0 -translate-x-full animate-[shimmer-sweep_1s_ease-in-out_infinite] bg-linear-to-r from-transparent via-foreground/10 to-transparent motion-reduce:animate-none" />
            </div>
        </div>
    );
}

interface MediaRowProps {
    list: TitleList;
    onSelect: (item: MediaItem) => void;
}

/** One sideways-scrolling row of a single list. It loads the next page as you
 * near the end, and only renders a window around the scroll position, so a
 * long-scrolled row doesn't pile up DOM and images. */
export default function MediaRow({ list, onSelect }: MediaRowProps) {
    const rowRef = useRef<HTMLDivElement>(null);
    const [first, setFirst] = useState(0);
    const shown = list.items.slice(first, first + WINDOW_CARDS);

    // A page that just landed can already leave the row near its end.
    useEffect(() => {
        if (list.canLoadMore && rowRef.current && isNearEnd(rowRef.current)) list.loadMore();
    }, [list]);

    // The mouse wheel scrolls the row sideways while the pointer is on it. A native listener,
    // because React's onWheel is passive and can't stop the page from scrolling too.
    useEffect(() => {
        const row = rowRef.current;
        if (!row) return;
        let target = 0;
        let lastWheelAt = -Infinity;
        let pageScrolledAt = -Infinity;
        const onPageScroll = (event: Event) => (pageScrolledAt = event.timeStamp);
        const onWheel = (event: WheelEvent) => {
            // Firefox may count in lines rather than pixels.
            const delta = event.deltaY * (event.deltaMode ? 40 : 1);
            // A sideways swipe already scrolls the row, and a page scroll under way carries on over it.
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            if (event.timeStamp - pageScrolledAt < 300) return;
            // Steps add up from the last target: a smooth scroll restarted mid-way would drop them.
            if (event.timeStamp - lastWheelAt > 200) target = row.scrollLeft;
            lastWheelAt = event.timeStamp;
            const next = Math.min(Math.max(target + delta, 0), row.scrollWidth - row.clientWidth);
            if (next === target) return; // at an end, the page scrolls instead
            event.preventDefault();
            target = next;
            row.scrollTo({ left: target, behavior: 'smooth' });
        };
        window.addEventListener('scroll', onPageScroll, { passive: true });
        row.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            window.removeEventListener('scroll', onPageScroll);
            row.removeEventListener('wheel', onWheel);
        };
    }, []);

    return (
        <div
            ref={rowRef}
            onScroll={(event) => {
                const row = event.currentTarget;
                setFirst(firstRenderedIndex(row));
                if (list.canLoadMore && isNearEnd(row)) list.loadMore();
            }}
            // Snapping only on touch screens: with a mouse it pulls short wheel steps back to the
            // same card. scroll-px-1 stops a 4px snap nudge from the padding.
            className="-mx-1 mt-3 flex pointer-coarse:snap-x scroll-px-1 gap-4 overflow-x-auto px-1 pt-1 pb-3 scrollbar-row [--card-w:9rem] sm:[--card-w:10rem] xl:[--card-w:11rem]"
        >
            <Spacer count={first} />
            {shown.map((item) => (
                <div key={item.id} data-card className={CELL}>
                    <MediaCard item={item} onSelect={onSelect} />
                </div>
            ))}
            <Spacer count={list.items.length - first - shown.length} />
            {list.loading &&
                list.items.length === 0 &&
                Array.from({ length: 6 }, (_, index) => <Placeholder key={index} />)}
            {list.loadingMore && [0, 1].map((index) => <Placeholder key={index} />)}
            {(list.failed || list.moreFailed) && (
                <div className={CELL}>
                    <button
                        type="button"
                        onClick={list.retry}
                        className="flex aspect-2/3 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-3 text-center text-sm text-muted-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-3 focus-visible:ring-gold/60"
                    >
                        <WifiOff aria-hidden className="size-6" />
                        Couldn't load {list.items.length ? 'more' : 'these'} — try again
                    </button>
                </div>
            )}
        </div>
    );
}
