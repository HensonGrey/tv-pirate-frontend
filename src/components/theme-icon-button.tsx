import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useToggleTheme } from '@/hooks/use-theme-sync';
import { cn } from '@/lib/utils';

/** Small icon button that flips light/dark (OS theme wins until the user picks one; signed in, the pick is saved to the account). */
export default function ThemeIconButton({ className }: { className?: string }) {
    const { resolvedTheme } = useTheme();
    const toggleTheme = useToggleTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    return (
        <button
            type="button"
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className={cn(
                'flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-gold/60',
                className,
            )}
        >
            {mounted &&
                (resolvedTheme === 'dark' ? (
                    <Sun className="size-5" />
                ) : (
                    <Moon className="size-5" />
                ))}
        </button>
    );
}
