import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import Kicker from '@/components/kicker';
import { getErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { fetchSeason, type SeasonInfo } from '@/api/tmdb';
import { chipClasses } from './chip-classes';
import ExpandableDescription from './expandable-description';

interface EpisodePanelProps {
    tmdbId: number;
    seasonCount: number;
    season: number;
    episode: number;
    /** Shown when the selected episode has no overview of its own. */
    showOverview: string | null;
    onSelectSeason: (season: number) => void;
    onSelectEpisode: (episode: number) => void;
}

/** The TV half of the picker card: season chips, the episode grid, and "Now playing"
 * with the episode's description. */
export default function EpisodePanel({
    tmdbId,
    seasonCount,
    season,
    episode,
    showOverview,
    onSelectSeason,
    onSelectEpisode,
}: EpisodePanelProps) {
    const [seasonInfo, setSeasonInfo] = useState<SeasonInfo | null>(null);
    const [loading, setLoading] = useState(false);
    // Monotonic request token so a fast season-flip can't deliver stale episodes.
    const requestId = useRef(0);

    useEffect(() => {
        const id = ++requestId.current;
        setLoading(true);
        fetchSeason(tmdbId, season)
            .then((info) => {
                if (requestId.current !== id) return;
                setSeasonInfo(info);
                if (!info.episodes.some((ep) => ep.episodeNumber === episode)) onSelectEpisode(1);
            })
            .catch((error) => {
                if (requestId.current !== id) return;
                toast.error(
                    getErrorMessage(error, `Could not load the episodes of season ${season}`),
                );
            })
            .finally(() => {
                if (requestId.current !== id) return;
                setLoading(false);
            });
    }, [tmdbId, season]); // only a season change refetches — not an episode pick or a new callback

    const selectedEpisode = seasonInfo?.episodes.find((ep) => ep.episodeNumber === episode);
    // Episode overview first, the show's overview as the fallback.
    const description = selectedEpisode?.overview ?? showOverview;

    return (
        <>
            {/* The chips alone pick the season — a poster + name row
                above them would just repeat the selector. */}
            <div className="space-y-2 p-4">
                <Kicker>Season</Kicker>
                <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: seasonCount }, (_, index) => index + 1).map((number) => (
                        <button
                            key={number}
                            type="button"
                            aria-pressed={season === number}
                            onClick={() => onSelectSeason(number)}
                            className={chipClasses(season === number)}
                        >
                            S{number}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2 p-4">
                <Kicker>Episodes</Kicker>
                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading episodes…</p>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] gap-1">
                        {(seasonInfo?.episodes ?? []).map((ep, index) => (
                            <button
                                key={ep.episodeNumber ?? index}
                                type="button"
                                aria-label={`Episode ${ep.episodeNumber}: ${ep.name ?? 'Untitled'}`}
                                aria-pressed={episode === ep.episodeNumber}
                                title={ep.name ?? 'Untitled'}
                                onClick={() => onSelectEpisode(ep.episodeNumber ?? 1)}
                                className={cn(
                                    'grid aspect-square place-items-center rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
                                    episode === ep.episodeNumber
                                        ? 'border-gold bg-gold font-semibold text-gold-foreground shadow-sm'
                                        : 'border-border text-muted-foreground hover:border-gold/50 hover:text-foreground',
                                )}
                            >
                                {ep.episodeNumber}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-1.5 p-4">
                <Kicker>Now playing</Kicker>
                <h2 className="font-heading text-base font-semibold tracking-tight">
                    {selectedEpisode
                        ? `S${season}E${episode} · ${selectedEpisode.name ?? 'Untitled'}`
                        : `Season ${season}`}
                    {selectedEpisode?.runtimeMinutes != null && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                            {selectedEpisode.runtimeMinutes} min
                        </span>
                    )}
                </h2>
                {description != null && (
                    <ExpandableDescription key={description} text={description} />
                )}
            </div>
        </>
    );
}
