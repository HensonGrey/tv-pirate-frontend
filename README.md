# tv-pirate — frontend

React frontend for the tv-pirate learning project.

**Stack:** Vite · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · axios · react-router v7 · next-themes

## Features

- **Guest login** (`/login`) — Google button is a stub (no OAuth credentials yet); "Continue as guest" opens a confirm dialog explaining the browser-scoped session.
- **Route protection** — `RequireAuth` probes `GET /api/me` on startup (three states: probing → authenticated → redirect to `/login`). Client guards are UX only; the backend enforces auth on every request.
- **Silent session refresh** — axios interceptor catches 401s, runs one deduplicated refresh (rotation burns tokens, so parallel refreshes would fail), retries the original request. On failure: clears state and announces `SESSION_EXPIRED_EVENT`, which bounces the app to `/login`.
- **httpOnly cookie auth** — `withCredentials: true` everywhere; localStorage holds only a non-sensitive user object (id, username, provider).
- **App shell** — shadcn sidebar (collapses to icon rail on desktop), avatar showing the provider picture when present (initial fallback for guests), theme toggle, sign-out. Dark palette hand-tuned.

## Run

```powershell
npm install
npm run dev
```

The dev server proxies nothing — the API client talks to `VITE_API_BASE_URL` (default `http://localhost:8080`; copy `.env.example` to `.env.local` to override). Start the backend first.

Backend: [tv-pirate](https://github.com/HensonGrey/tv-pirate)
