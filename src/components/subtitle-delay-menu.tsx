interface SubtitleDelayMenuProps {
    /** Half-second ticks (0.5s step granularity, positive = delay the track). */
    delay: number;
    onChange: (delay: number) => void;
}

/** Button steps in half-second ticks: a fine 0.5s one and a coarse 5s one (a minute is
 * 120 fine taps). The delay itself is deliberately unbounded. */
const STEPS = [-10, -1, 1, 10];

/** The subtitle-delay stepper, living inside the player's settings menu.
 * Rendered via DefaultVideoLayout's `slots` prop (settingsMenuItemsEnd) —
 * NOT as a slot-attribute child, which the layout renders inline in the
 * player flow (that squishes the video). Two rows (label + value, then the
 * steps): the label and four buttons don't fit one row of a phone-width menu. */
export default function SubtitleDelayMenu({ delay, onChange }: SubtitleDelayMenuProps) {
    return (
        <div className="vds-menu-item flex-col gap-2">
            <div className="flex w-full items-center">
                <span className="vds-menu-item-label">Subtitle delay</span>
                <span className="vds-menu-item-hint tabular-nums">{formatDelay(delay)}</span>
            </div>
            <div className="flex w-full gap-1">
                {STEPS.map((step) => (
                    <button
                        key={step}
                        type="button"
                        aria-label={`Delay subtitles ${Math.abs(step) / 2} seconds ${step < 0 ? 'less' : 'more'}`}
                        onClick={() => onChange(delay + step)}
                        className="vds-menu-button vds-button flex-1"
                    >
                        {step > 0 && '+'}
                        {formatDelay(step)}
                    </button>
                ))}
            </div>
        </div>
    );
}

/** Half-second ticks → a human label: 0 → "0s", 1 → "0.5s", -3 → "-1.5s". */
function formatDelay(ticks: number): string {
    return `${(ticks / 2).toFixed(1).replace(/\.0$/, '')}s`;
}
