import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import GuestView from '@/components/GuestView';
import HomePage from '@/pages/home';
import WatchPage from '@/pages/watch';
import RequireAuth from '@/components/require-auth';
import { SESSION_EXPIRED_EVENT } from '@/api/client';
import { fetchMe, logout } from '@/api/auth';
import { getUser, type StoredUser } from '@/lib/authStorage';

function App() {
    const [user, setUser] = useState<StoredUser | null>(getUser);
    // authChecked: false until the /api/me probe answers.
    const [authChecked, setAuthChecked] = useState(false);

    // Probe /api/me — the httpOnly cookies are invisible to JS.
    useEffect(() => {
        let cancelled = false;
        fetchMe().then((me) => {
            if (cancelled) return;
            setUser(me);
            setAuthChecked(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // The API client announces a failed mid-session refresh via a custom event.
    useEffect(() => {
        function handleSessionExpired() {
            setUser(getUser());
        }
        window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    }, []);

    function handleLogout() {
        void logout(); // local-first; the server revoke is best-effort inside
        setUser(getUser());
    }

    return (
        <div className="min-h-dvh bg-background bg-linear-to-b from-muted/40 via-background to-background">
            <BrowserRouter>
                <Routes>
                    <Route
                        path="/login"
                        element={
                            user ? (
                                <Navigate to="/" replace />
                            ) : (
                                <GuestView onLoggedIn={() => setUser(getUser())} />
                            )
                        }
                    />
                    <Route element={<RequireAuth user={user} checked={authChecked} />}>
                        {/* user is non-null here — RequireAuth redirects otherwise */}
                        <Route
                            path="/"
                            element={<HomePage user={user!} onLogout={handleLogout} />}
                        />
                        {/* Watch routes carry the title's identity only; season/episode
                stay in component state (server progress will own them).
                The watch page renders the same app shell as home. */}
                        <Route
                            path="/movie/:id"
                            element={
                                <WatchPage mediaType="movie" user={user!} onLogout={handleLogout} />
                            }
                        />
                        <Route
                            path="/tv/:id"
                            element={
                                <WatchPage mediaType="tv" user={user!} onLogout={handleLogout} />
                            }
                        />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <Toaster position="bottom-right" />
            </BrowserRouter>
        </div>
    );
}

export default App;
