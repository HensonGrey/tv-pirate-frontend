/** Last-picked stream provider, persisted per browser so the picker opens
 * where the user left it. Server-side per-user prefs can replace this
 * wholesale later. */

const KEY = 'tv-pirate:preferred-provider'

export function getPreferredProvider(): string | null {
  return localStorage.getItem(KEY)
}

export function setPreferredProvider(provider: string) {
  localStorage.setItem(KEY, provider)
}
