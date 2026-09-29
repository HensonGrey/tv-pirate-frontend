/** "star wars" → "/?search=star+wars" — the browse page, searching in place. */
export function searchPath(query: string): string {
    return `/?${new URLSearchParams({ search: query })}`;
}
