/** The account's light/dark choice, so it follows the user to every device. */

import { client } from './client';

export type ThemeChoice = 'light' | 'dark';

/** The saved choice, or null when the account never picked one (the OS decides). */
export async function fetchTheme(): Promise<ThemeChoice | null> {
    const { data } = await client.get<{ theme: ThemeChoice | null }>('/api/theme');
    return data.theme;
}

export async function saveTheme(theme: ThemeChoice): Promise<void> {
    await client.put('/api/theme', { theme });
}
