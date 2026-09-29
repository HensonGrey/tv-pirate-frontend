import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Shows a few lines by default and fades out when clipped; clicking it (or the hint)
 * animates the block open to its full height — the panel then scrolls internally.
 * Render it with key={text} so a new title/episode starts collapsed again. */
export default function ExpandableDescription({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);
    // Full text height in px, measured once when expanding so max-height can
    // transition to the real size instead of an arbitrary cap.
    const [maxHeight, setMaxHeight] = useState(0);
    const [overflows, setOverflows] = useState(false);
    const ref = useRef<HTMLParagraphElement>(null);

    // Keeps the expanded block sized to its content on resize, and tells the
    // hint whether the collapsed view is actually clipping text.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const check = () => {
            if (expanded) setMaxHeight(el.scrollHeight);
            setOverflows(el.scrollHeight > el.clientHeight + 4);
        };
        check();
        const observer = new ResizeObserver(check);
        observer.observe(el);
        return () => observer.disconnect();
    }, [expanded]);

    function toggle() {
        if (!expanded) {
            // scrollHeight reports the full text even while the block is clamped.
            setMaxHeight(ref.current?.scrollHeight ?? 600);
        }
        setExpanded((v) => !v);
    }

    return (
        <>
            <p
                ref={ref}
                onClick={toggle}
                style={expanded ? { maxHeight } : undefined}
                className={cn(
                    'max-h-19.5 cursor-pointer overflow-hidden text-base leading-relaxed text-muted-foreground transition-[max-height] duration-300 ease-out',
                    !expanded &&
                        'mask-[linear-gradient(to_bottom,black_calc(100%-28px),transparent)]',
                )}
            >
                {text}
            </p>
            {(overflows || expanded) && (
                <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={toggle}
                    className="self-start text-xs font-semibold text-gold transition-colors outline-none hover:underline focus-visible:ring-2 focus-visible:ring-gold/60"
                >
                    {expanded ? 'Show less' : 'Read more'}
                </button>
            )}
        </>
    );
}
