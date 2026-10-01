import { useEffect, useRef } from 'react';
import { subscribe, type SyncKindEnum } from '@/api/liveSync';

/** Runs `onChange` when another tab or device changes `kind`, while the component is mounted. */
export function useLiveSync(kind: SyncKindEnum, onChange: () => void) {
    // Always the latest callback, so a new function each render doesn't re-subscribe.
    const latest = useRef(onChange);
    latest.current = onChange;

    useEffect(() => subscribe(kind, () => latest.current()), [kind]);
}
