import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { SidebarMenuButton } from '@/components/ui/sidebar';

/** Sidebar theme toggle; the OS theme wins until the user picks one (next-themes persists it). Only reachable signed-in. */
export default function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Render the icon only after mount to avoid flashing the wrong one.
    useEffect(() => setMounted(true), []);

    return (
        <SidebarMenuButton
            tooltip="Toggle theme"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
            {mounted && (resolvedTheme === 'dark' ? <Sun /> : <Moon />)}
            <span>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </SidebarMenuButton>
    );
}
