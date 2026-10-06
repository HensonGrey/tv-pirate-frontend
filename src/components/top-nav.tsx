import { useEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Clapperboard, Compass, Library, LogOut, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ConfirmDialog from '@/components/confirm-dialog';
import ThemeIconButton from '@/components/theme-icon-button';
import { deleteAccount } from '@/api/auth';
import { getErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import type { StoredUser } from '@/lib/authStorage';

export type TabId = 'browse' | 'library';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
    { id: 'browse', label: 'Browse', icon: Compass },
    { id: 'library', label: 'Library', icon: Library },
];

interface TopNavProps {
    /** The highlighted tab; none on pages outside the tabs (watch). */
    tab?: TabId;
    onTabChange: (tab: TabId) => void;
    query: string;
    onQueryChange: (query: string) => void;
    /** Enter or the search icon: opens the search page for the query. */
    onSubmit: () => void;
    /** Watch pages render a wider content column than home — the nav follows
     *  it so the edges stay aligned. */
    wide?: boolean;
    user: StoredUser;
    onLogout: () => void;
}

const ICON_BUTTON =
    'flex size-10 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-gold/60';

/**
 * App shell: brand + section tabs on the left, search + theme + account on
 * the right. On mobile the tabs become a scrollable strip and search collapses
 * behind an icon that expands a second row.
 */
export default function TopNav({
    tab,
    onTabChange,
    query,
    onQueryChange,
    onSubmit,
    wide = false,
    user,
    onLogout,
}: TopNavProps) {
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [signOutOpen, setSignOutOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const mobileSearchRef = useRef<HTMLInputElement>(null);

    // Guests get a confirmation before signing out — there's no way back in.
    const isGuest = user.provider === 'GUEST';

    async function handleDeleteAccount() {
        setDeleting(true);
        try {
            await deleteAccount();
            onLogout();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not delete your account. Try again.'));
        } finally {
            setDeleting(false);
        }
    }

    useEffect(() => {
        if (mobileSearchOpen) mobileSearchRef.current?.focus();
    }, [mobileSearchOpen]);

    const searchInput = (inputRef: Ref<HTMLInputElement> | undefined, className: string) => (
        <div className={cn('relative', className)}>
            <Input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') setMobileSearchOpen(false);
                    if (event.key === 'Enter') onSubmit();
                }}
                placeholder="Search movies & shows"
                aria-label="Search movies and shows"
                className="h-9 w-full pl-9"
            />
            {/* After the input so it paints on top of it. */}
            <button
                type="button"
                aria-label="Submit search"
                title="Search"
                onClick={onSubmit}
                className="absolute top-1/2 left-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-gold/60"
            >
                <Search aria-hidden className="size-4" />
            </button>
        </div>
    );

    return (
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
            <div
                className={cn(
                    'mx-auto flex h-14 items-center gap-1 px-4 sm:gap-2 sm:px-6 lg:px-8',
                    wide ? 'max-w-384' : 'max-w-7xl',
                )}
            >
                {/* Brand — clicking it always leads home (browse). */}
                <button
                    type="button"
                    onClick={() => onTabChange('browse')}
                    className="flex items-center gap-2 rounded-lg px-1 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-gold/60"
                >
                    <Clapperboard aria-hidden className="size-6 text-gold" />
                    <span className="font-heading text-lg font-bold tracking-tight">
                        Adomination
                    </span>
                </button>

                {/* Desktop tabs */}
                <nav
                    aria-label="Sections"
                    className="ml-2 hidden items-center gap-1 md:flex lg:ml-6"
                >
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            aria-current={tab === id ? 'page' : undefined}
                            onClick={() => onTabChange(id)}
                            className={cn(
                                'relative flex h-14 items-center gap-2 px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-gold/60',
                                tab === id
                                    ? 'text-gold'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Icon aria-hidden className="size-4" />
                            {label}
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gold transition-opacity',
                                    tab === id ? 'opacity-100' : 'opacity-0',
                                )}
                            />
                        </button>
                    ))}
                </nav>

                <div className="ml-auto flex items-center gap-1">
                    {/* Desktop search */}
                    {searchInput(undefined, 'hidden md:block md:w-64 lg:w-96 xl:w-md')}
                    {/* Mobile search toggle */}
                    <button
                        type="button"
                        aria-label="Search"
                        aria-expanded={mobileSearchOpen}
                        onClick={() => setMobileSearchOpen((open) => !open)}
                        className={cn(ICON_BUTTON, 'md:hidden')}
                    >
                        <Search className="size-6" />
                    </button>
                    <ThemeIconButton className="size-10 [&_svg]:size-6" />
                    {/* Account: the avatar opens the menu that holds Sign out. */}
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            aria-label="Account menu"
                            className="ml-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-gold/60"
                        >
                            <Avatar className="size-10 ring-1 ring-border transition-shadow hover:ring-2 hover:ring-gold/60">
                                {user.profilePictureUrl && (
                                    <AvatarImage src={user.profilePictureUrl} alt="" />
                                )}
                                <AvatarFallback className="text-sm">
                                    {user.username.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuLabel>
                                {isGuest ? 'Guest Profile' : user.username}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                onClick={() => (isGuest ? setSignOutOpen(true) : onLogout())}
                            >
                                <LogOut aria-hidden />
                                Sign out
                            </DropdownMenuItem>
                            {/* Guests have no delete: signing out already discards their account. */}
                            {!isGuest && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => setDeleteOpen(true)}
                                    >
                                        <Trash2 aria-hidden />
                                        Delete account
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Mobile tab strip: icons only on narrow screens, labels from sm up. */}
            <nav
                aria-label="Sections"
                className="no-scrollbar flex gap-1 overflow-x-auto px-4 pb-2 md:hidden"
            >
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        aria-label={label}
                        title={label}
                        aria-current={tab === id ? 'page' : undefined}
                        onClick={() => onTabChange(id)}
                        className={cn(
                            // Icon-only phones: stretch across the full strip
                            // width (evenly spaced), labels from sm up go back
                            // to natural width.
                            'flex h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-gold/60 sm:flex-none sm:justify-start',
                            tab === id
                                ? 'bg-gold/15 text-gold'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                    >
                        <Icon aria-hidden className="size-4" />
                        <span className="hidden sm:inline">{label}</span>
                    </button>
                ))}
            </nav>

            {/* Mobile search row */}
            {mobileSearchOpen && (
                <div className="px-4 pt-1 pb-2 md:hidden">{searchInput(mobileSearchRef, '')}</div>
            )}

            <ConfirmDialog
                open={signOutOpen}
                onOpenChange={setSignOutOpen}
                title="Sign out?"
                confirmLabel="Sign out"
                variant="destructive"
                onConfirm={onLogout}
                description="You signed in as a guest. Logging out means losing this guest account permanently."
            />

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete your account?"
                confirmLabel="Delete account"
                variant="destructive"
                loading={deleting}
                onConfirm={handleDeleteAccount}
                description="Your favourites and watch progress are deleted for good. Signing in again starts a new, empty account."
            />
        </header>
    );
}
