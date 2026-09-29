/** "star wars" → "/search?q=star+wars" — the dedicated search page, so a
 * search is a history entry that back navigation returns to. */
export function searchPath(query: string): string {
    return `/search?${new URLSearchParams({ q: query })}`;
}
