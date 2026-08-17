/** The favourites API — one shared list seeds every page's hearts, and the
 * toggles fire idempotent PUT/DELETE calls so replays can't corrupt state. */

import { client } from './client';
import type { MediaType } from './tmdb';

/** One saved favourite: the title's identity in both TMDB id spaces. */
export interface FavouriteRow {
    tmdbId: number;
    mediaType: MediaType;
}

/** All favourites for the signed-in user, oldest first. */
export async function fetchFavourites(): Promise<FavouriteRow[]> {
    const { data } = await client.get<FavouriteRow[]>('/api/favourites');
    return data;
}

export async function addFavourite(tmdbId: number, mediaType: MediaType): Promise<void> {
    await client.put('/api/favourites', { tmdbId, mediaType });
}

export async function removeFavourite(tmdbId: number, mediaType: MediaType): Promise<void> {
    await client.delete(`/api/favourites/${mediaType}/${tmdbId}`);
}
