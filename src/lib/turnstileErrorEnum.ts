/** What went wrong in Cloudflare's Turnstile widget, grouped from its numeric error codes. */
export enum TurnstileErrorEnum {
    UnknownDomain = 'unknown-domain',
    InvalidSiteKey = 'invalid-site-key',
    UnsupportedBrowser = 'unsupported-browser',
    TimedOut = 'timed-out',
    ChallengeFailed = 'challenge-failed',
    Unknown = 'unknown',
}

const ERRORS_BY_CODE: Record<string, TurnstileErrorEnum> = {
    '110200': TurnstileErrorEnum.UnknownDomain,
    '110100': TurnstileErrorEnum.InvalidSiteKey,
    '110110': TurnstileErrorEnum.InvalidSiteKey,
    '400020': TurnstileErrorEnum.InvalidSiteKey,
    '110500': TurnstileErrorEnum.UnsupportedBrowser,
    '110510': TurnstileErrorEnum.UnsupportedBrowser,
    '110600': TurnstileErrorEnum.TimedOut,
    '110620': TurnstileErrorEnum.TimedOut,
};

// Whole families rather than single codes: every 300xxx and 600xxx means the challenge itself failed.
const CHALLENGE_FAILED_PREFIXES = ['300', '600'];

const MESSAGES: Record<TurnstileErrorEnum, string> = {
    [TurnstileErrorEnum.UnknownDomain]: `Bot check misconfigured: ${window.location.hostname} isn't on the Turnstile widget's hostname list.`,
    [TurnstileErrorEnum.InvalidSiteKey]:
        'Bot check misconfigured: Cloudflare rejected the site key (VITE_TURNSTILE_SITE_KEY).',
    [TurnstileErrorEnum.UnsupportedBrowser]:
        "The bot check doesn't support this browser. Try updating it.",
    [TurnstileErrorEnum.TimedOut]: 'The bot check timed out. Close the dialog and try again.',
    [TurnstileErrorEnum.ChallengeFailed]:
        "The bot check couldn't confirm you're human. Close the dialog and try again.",
    [TurnstileErrorEnum.Unknown]: 'The bot check failed. Close the dialog and try again.',
};

function toTurnstileError(code: string): TurnstileErrorEnum {
    if (ERRORS_BY_CODE[code]) return ERRORS_BY_CODE[code];
    return CHALLENGE_FAILED_PREFIXES.some((prefix) => code.startsWith(prefix))
        ? TurnstileErrorEnum.ChallengeFailed
        : TurnstileErrorEnum.Unknown;
}

/** The raw code is kept on the end, so it can be looked up in Cloudflare's docs without opening the console. */
export function getTurnstileErrorMessage(code: string): string {
    return `${MESSAGES[toTurnstileError(code)]} (Cloudflare error ${code})`;
}
