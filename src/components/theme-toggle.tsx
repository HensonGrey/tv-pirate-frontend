import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { SidebarMenuButton } from '@/components/ui/sidebar'

/**
 * Theme toggle as a sidebar menu entry. next-themes keeps the choice in
 * localStorage; until the user picks one, the OS theme wins. (Trade-off:
 * the toggle lives inside the sidebar, so it's only reachable signed-in.)
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // On the very first render the resolved theme isn't known yet — render the
  // icon only after mount to avoid flashing the wrong one.
  useEffect(() => setMounted(true), [])

  return (
    <SidebarMenuButton
      tooltip="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {mounted && (resolvedTheme === 'dark' ? <Sun /> : <Moon />)}
      <span>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </SidebarMenuButton>
  )
}
