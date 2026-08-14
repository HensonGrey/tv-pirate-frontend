import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import AppSidebar from '@/components/app-sidebar'
import type { StoredUser } from '@/lib/authStorage'

interface HomePageProps {
  user: StoredUser
  onLogout: () => void
}

/** The authenticated home — intentionally empty for now. */
export default function HomePage({ user, onLogout }: HomePageProps) {
  return (
    <SidebarProvider>
      <AppSidebar user={user} onLogout={onLogout} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        {/* Future content: rooms, shows, player… */}
      </SidebarInset>
    </SidebarProvider>
  )
}
