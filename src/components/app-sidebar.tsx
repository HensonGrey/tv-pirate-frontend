import { Home, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ThemeToggle from '@/components/theme-toggle';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { StoredUser } from '@/lib/authStorage';

interface AppSidebarProps {
    user: StoredUser;
    onLogout: () => void;
}

/** Brand, nav stub, and user section. collapsible="icon" shrinks the desktop sidebar to icons with tooltips instead of sliding off-screen. */
export default function AppSidebar({ user, onLogout }: AppSidebarProps) {
    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <p className="px-2 font-heading text-lg font-semibold group-data-[collapsible=icon]:hidden">
                    tv-pirate
                </p>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Menu</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton isActive>
                                    <Home />
                                    <span>Home</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton tooltip={user.username}>
                            {/* Provider picture when there is one (Google's "picture");
                  guests have none and fall back to the initial. */}
                            <Avatar className="size-5">
                                {user.profilePictureUrl && (
                                    <AvatarImage src={user.profilePictureUrl} alt={user.username} />
                                )}
                                <AvatarFallback className="text-xs">
                                    {user.username.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <span className="truncate">{user.username}</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <ThemeToggle />
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            tooltip="Sign out"
                            onClick={onLogout}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:text-destructive dark:hover:text-destructive"
                        >
                            <LogOut />
                            <span>Sign out</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
