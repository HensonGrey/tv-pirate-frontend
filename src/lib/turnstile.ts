const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Public by design. Unset means no bot check, matching a backend without TURNSTILE_SECRET_KEY. */
export const TURNSTILE_SITE_KEY: string | undefined =
    import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined;

interface TurnstileOptions {
    sitekey: string;
    theme: 'light' | 'dark';
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
}

export interface TurnstileApi {
    render: (container: HTMLElement, options: TurnstileOptions) => string;
    remove: (widgetId: string) => void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Adds Cloudflare's script on first use, so only the guest dialog ever loads it. */
export function loadTurnstile(): Promise<TurnstileApi> {
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = SCRIPT_URL;
            script.async = true;
            script.onload = () =>
                window.turnstile
                    ? resolve(window.turnstile)
                    : reject(new Error('Turnstile script loaded without its API'));
            script.onerror = () => {
                // Cleared so the next dialog open tries again.
                scriptPromise = null;
                reject(new Error('Turnstile script failed to load'));
            };
            document.head.appendChild(script);
        });
    }
    return scriptPromise;
}
