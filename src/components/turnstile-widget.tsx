import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { loadTurnstile } from '@/lib/turnstile';

interface TurnstileWidgetProps {
    siteKey: string;
    /** The token once Cloudflare is satisfied; null while there is none (expired, errored, unmounted). */
    onToken: (token: string | null) => void;
}

/** Cloudflare's bot-check box. Tokens are single-use, so the parent remounts it (new key) after each try. */
export default function TurnstileWidget({ siteKey, onToken }: TurnstileWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { resolvedTheme } = useTheme();
    const theme = resolvedTheme === 'dark' ? 'dark' : 'light';

    useEffect(() => {
        let cancelled = false;
        let widgetId: string | null = null;
        loadTurnstile()
            .then((turnstile) => {
                if (cancelled || !containerRef.current) return;
                widgetId = turnstile.render(containerRef.current, {
                    sitekey: siteKey,
                    theme,
                    callback: onToken,
                    'expired-callback': () => onToken(null),
                    'error-callback': () => onToken(null),
                });
            })
            .catch(() => {
                // The id dedupes StrictMode's second run.
                toast.error("Couldn't load the bot check. Check your connection or ad blocker.", {
                    id: 'turnstile-load',
                });
            });
        return () => {
            cancelled = true;
            onToken(null);
            if (widgetId !== null) window.turnstile?.remove(widgetId);
        };
    }, [siteKey, theme, onToken]);

    // 65px is the widget's own height, held so the dialog doesn't jump when it appears.
    return <div ref={containerRef} className="flex min-h-16.25 justify-center" />;
}
