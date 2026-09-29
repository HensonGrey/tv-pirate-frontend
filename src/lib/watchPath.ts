import type { MediaType } from '@/api/tmdb';
import { slugify } from '@/lib/slug';

/** (tv, 1396, "Breaking Bad") → "/tv/1396-breaking-bad" — the watch page. The route
 * carries the title's identity only; season/episode live in the watch page's state. */
export function watchPath(mediaType: MediaType, id: number, title: string | null): string {
    return `/${mediaType}/${id}-${slugify(title)}`;
}
