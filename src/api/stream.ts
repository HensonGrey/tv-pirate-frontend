/** The stream API — provider picker + resolve-on-play. The player only ever
 * sees proxied capability tokens, never a real upstream URL. */

import { client, API_BASE } from './client'
import type { MediaType } from './tmdb'

/** One playable source: the quality label, the format the player must
 * expect, and the proxied playback URL (relative — see absoluteProxyUrl). */
export interface StreamSourceDto {
  quality: string
  format: 'mp4' | 'hls'
  proxyUrl: string
}

/** The picker list, sorted by the backend. */
export async function fetchStreamProviders(): Promise<string[]> {
  const { data } = await client.get<string[]>('/api/stream/providers')
  return data
}

/** Resolve exactly the named provider for one title (or one episode).
 * Season/episode are omitted for movies — axios skips undefined params. */
export async function fetchSources(
  provider: string,
  type: MediaType,
  tmdbId: number,
  season?: number,
  episode?: number
): Promise<StreamSourceDto[]> {
  const { data } = await client.get<StreamSourceDto[]>('/api/stream/sources', {
    params: { provider, type, tmdbId, season, episode },
  })
  return data
}

/** The backend hands out relative proxy paths; a <video src> needs a full URL. */
export function absoluteProxyUrl(proxyUrl: string): string {
  return `${API_BASE}${proxyUrl}`
}
