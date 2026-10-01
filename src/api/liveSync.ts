import { API_BASE, CLIENT_ID, client } from '@/api/client';

/** What changed, named the way the server names its notes. */
export enum SyncKindEnum {
    Favourites = 'favourites',
    Progress = 'progress',
}

const DEBOUNCE_MS = 300;
const MAX_BACKOFF_MS = 30_000;

const listeners = new Map<SyncKindEnum, Set<() => void>>();
const debounceTimers = new Map<SyncKindEnum, ReturnType<typeof setTimeout>>();
let source: EventSource | null = null;
// The first connection needs no catch-up: whoever subscribed has just loaded its data.
let connectedBefore = false;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/** Calls `onChange` when another tab or device changes `kind`, and after any gap in the
 * connection, since a change may have been missed. The one shared line to the server opens
 * with the first subscriber and closes with the last. Returns the unsubscribe. */
export function subscribe(kind: SyncKindEnum, onChange: () => void): () => void {
    const kindListeners = listeners.get(kind) ?? new Set<() => void>();
    listeners.set(kind, kindListeners);
    kindListeners.add(onChange);
    if (!source && !retryTimer) connect();

    return () => {
        kindListeners.delete(onChange);
        if (!hasListeners()) disconnect();
    };
}

function hasListeners() {
    return [...listeners.values()].some((set) => set.size > 0);
}

function connect() {
    source = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });
    source.addEventListener('ready', onReady);
    for (const kind of Object.values(SyncKindEnum)) {
        source.addEventListener(kind, (event) =>
            onNote(kind, (event as MessageEvent<string>).data),
        );
    }
    source.onerror = onError;
}

function onReady() {
    failures = 0;
    if (connectedBefore) notifyAll();
    connectedBefore = true;
}

/** `origin` is the tab that made the change; a tab doesn't need to hear about its own. */
function onNote(kind: SyncKindEnum, origin: string) {
    if (origin !== CLIENT_ID) notify(kind);
}

// A burst of notes (several hearts in a row) becomes one reload.
function notify(kind: SyncKindEnum) {
    clearTimeout(debounceTimers.get(kind));
    debounceTimers.set(
        kind,
        setTimeout(() => listeners.get(kind)?.forEach((onChange) => onChange()), DEBOUNCE_MS),
    );
}

function notifyAll() {
    for (const kind of listeners.keys()) notify(kind);
}

function onError() {
    // While the browser is retrying by itself there is nothing to do. A closed source is one
    // it gave up on: the login expired, or the server refused us.
    if (!source || source.readyState !== EventSource.CLOSED) return;
    source.close();
    source = null;
    retryTimer = setTimeout(reconnect, Math.min(MAX_BACKOFF_MS, 1000 * 2 ** failures++));
}

async function reconnect() {
    retryTimer = undefined;
    // An expired login is the usual reason a line is refused, and any request refreshes it.
    await client.get('/api/me').catch(() => undefined);
    if (hasListeners() && !source) connect();
}

function disconnect() {
    source?.close();
    source = null;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    for (const timer of debounceTimers.values()) clearTimeout(timer);
    debounceTimers.clear();
    connectedBefore = false;
    failures = 0;
}

// Coming back to a tab: it may have slept through changes, or lost its line while hidden.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !hasListeners()) return;
    notifyAll();
    if (!source) {
        clearTimeout(retryTimer);
        failures = 0;
        void reconnect();
    }
});
