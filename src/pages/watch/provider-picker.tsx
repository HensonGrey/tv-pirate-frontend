import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Kicker from '@/components/kicker';
import { fetchStreamProviders } from '@/api/stream';
import { getErrorMessage } from '@/lib/apiError';
import { clearPreferredProvider, setPreferredProvider } from '@/lib/providerPreference';
import { chipClasses } from './chip-classes';

interface ProviderPickerProps {
    provider: string | null;
    /** Must be stable (a state setter): the fallback effect depends on it. */
    onChange: (provider: string) => void;
}

/** Provider chips. The list loads once; picking one also remembers it for next time. */
export default function ProviderPicker({ provider, onChange }: ProviderPickerProps) {
    const [providers, setProviders] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchStreamProviders()
            .then((list) => {
                if (!cancelled) setProviders(list);
            })
            .catch((error) =>
                toast.error(getErrorMessage(error, 'Could not load the provider list')),
            );
        return () => {
            cancelled = true;
        };
    }, []);

    // A remembered provider can vanish from the registry (removed, or switched
    // off) — drop it and fall back to the first enabled one. Not remembered:
    // only a click is a real preference.
    useEffect(() => {
        if (providers.length === 0) return;
        if (provider == null) {
            onChange(providers[0]);
            return;
        }
        if (!providers.includes(provider)) {
            clearPreferredProvider();
            onChange(providers[0]);
        }
    }, [providers, provider, onChange]);

    function select(name: string) {
        setPreferredProvider(name);
        onChange(name);
    }

    return (
        <div className="space-y-2 p-4">
            <Kicker>Provider</Kicker>
            <div className="flex flex-wrap gap-1.5">
                {providers.map((name) => (
                    <button
                        key={name}
                        type="button"
                        aria-pressed={provider === name}
                        onClick={() => select(name)}
                        className={chipClasses(provider === name)}
                    >
                        {name}
                    </button>
                ))}
            </div>
        </div>
    );
}
