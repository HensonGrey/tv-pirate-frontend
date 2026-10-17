import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { useToggleTheme } from '@/hooks/use-theme-sync';

/** Sidebar theme toggle; the OS theme wins until the user picks one, which is saved to the account. Only reachable signed-in. */
export default function ThemeToggle() {
    const { resolvedTheme } = useTheme();
    const toggleTheme = useToggleTheme();
    const [mounted, setMounted] = useState(false);

    // Render the icon only after mount to avoid flashing the wrong one.
    useEffect(() => setMounted(true), []);

    return (
        <SidebarMenuButton tooltip="Toggle theme" onClick={toggleTheme}>
            {mounted && (resolvedTheme === 'dark' ? <Sun /> : <Moon />)}
            <span>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </SidebarMenuButton>
    );
}
