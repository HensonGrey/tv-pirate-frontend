import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { SyncKindEnum } from '@/api/liveSync';
import { fetchTheme, saveTheme, type ThemeChoice } from '@/api/theme';
import { useLiveSync } from '@/hooks/use-live-sync';
import { getUser } from '@/lib/authStorage';

/** Signed in: applies the account's theme on load and whenever another tab or device
 * changes it. An account that never picked one takes this browser's choice, if it made one. */
export function useThemeSync() {
    const { theme, setTheme } = useTheme();
    // The latest values, so a theme change doesn't re-run the load: next-themes hands
    // out a new setTheme for every theme.
    const latest = useRef({ theme, setTheme });
    latest.current = { theme, setTheme };
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchTheme()
            .then((saved) => {
                if (cancelled) return;
                const local = latest.current.theme;
                if (saved) latest.current.setTheme(saved);
                else if (local === 'light' || local === 'dark')
                    saveTheme(local).catch(() => undefined);
            })
            // Offline or a blip: this browser's own choice stays.
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    useLiveSync(SyncKindEnum.Theme, () => setReloadKey((key) => key + 1));
}

/** Flips light/dark here at once, and saves it to the account when signed in. */
export function useToggleTheme() {
    const { resolvedTheme, setTheme } = useTheme();
    return () => {
        const next: ThemeChoice = resolvedTheme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        // A failed save only means the other devices don't hear of it.
        if (getUser()) saveTheme(next).catch(() => undefined);
    };
}
