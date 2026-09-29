/** Stable key for a title across both id spaces — movie 123 ≠ tv 123. */
export function titleKey(mediaType: string, id: number): string {
    return `${mediaType}:${id}`;
}
