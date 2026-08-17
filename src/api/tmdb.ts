/** The TMDB proxy API — the browser never talks to TMDB directly; the
 * backend forwards these calls with the key it keeps in .env. */

import { client } from './client';

export type MediaType = 'movie' | 'tv';
export type TrendWindow = 'day' | 'week';

/**
 * One title, list or detail. Mirrors the backend's MediaItem JSON 1:1 —
 * everything nullable because TMDB's data is (missing posters, missing
 * dates), and the UI decides how to present each gap.
 */
export interface MediaItem {
    id: number;
    mediaType: MediaType | null;
    title: string | null;
    overview: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    /** 0–10, one decimal; null when TMDB has no votes */
    rating: number | null;
    genres: string[];
    year: number | null;
    /** Movies only, minutes */
    runtimeMinutes: number | null;
    /** TV only */
    seasons: number | null;
    episodes: number | null;
}

/** Every list endpoint answers with this envelope. totalPages 0 means "no
 * more pages" — TMDB can send null totals, and the backend maps them to 0. */
export interface PageResponse<T> {
    page: number;
    results: T[];
    totalPages: number;
    totalResults: number;
}

/** One selectable genre row; each id exists only in its own media type's table. */
export interface GenreInfo {
    name: string;
    movieId: number | null;
    tvId: number | null;
}

/** Mixed movies + shows trending right now. */
export async function fetchTrending(
    window: TrendWindow = 'day',
    page = 1,
): Promise<PageResponse<MediaItem>> {
    const { data } = await client.get<PageResponse<MediaItem>>('/api/tmdb/trending', {
        params: { window, page },
    });
    return data;
}

/** Popularity-sorted movies or tv, optionally narrowed by genre names
 * (OR semantics, applied server-side). */
export async function fetchDiscover(
    type: MediaType,
    genres: string[] = [],
    page = 1,
): Promise<PageResponse<MediaItem>> {
    const { data } = await client.get<PageResponse<MediaItem>>('/api/tmdb/discover', {
        params: { type, page, genres: genres.length > 0 ? genres.join(',') : undefined },
    });
    return data;
}

/** Title search across movies + shows (people never enter the results). */
export async function searchTitles(query: string, page = 1): Promise<PageResponse<MediaItem>> {
    const { data } = await client.get<PageResponse<MediaItem>>('/api/tmdb/search', {
        params: { query, page },
    });
    return data;
}

/** Full detail for one title: runtime for movies, seasons/episodes for tv. */
export async function fetchTitleDetail(type: MediaType, id: number): Promise<MediaItem> {
    const { data } = await client.get<MediaItem>(`/api/tmdb/${type}/${id}`);
    return data;
}

/** One episode of a season — feeds the picker and the episode description. */
export interface EpisodeInfo {
    episodeNumber: number | null;
    name: string | null;
    overview: string | null;
    runtimeMinutes: number | null;
}

/** One season of a show: identity + poster for the picker's visuals, and
 * the episode list the picker selects from. */
export interface SeasonInfo {
    seasonNumber: number | null;
    name: string | null;
    posterUrl: string | null;
    episodes: EpisodeInfo[];
}

/** One season of a show (poster + names + overviews for the picker). */
export async function fetchSeason(tvId: number, season: number): Promise<SeasonInfo> {
    const { data } = await client.get<SeasonInfo>(`/api/tmdb/tv/${tvId}/season/${season}`);
    return data;
}

/** The selectable genre list, movie + tv tables merged (see GenreInfo). */
export async function fetchGenres(): Promise<GenreInfo[]> {
    const { data } = await client.get<GenreInfo[]>('/api/tmdb/genres');
    return data;
}
