/** Why a redirect sign-in came back to /login as ?signInError=; mirrors the backend's SignInErrorEnum. */
export enum SignInErrorEnum {
    Cancelled = 'cancelled',
    Failed = 'failed',
    Unavailable = 'unavailable',
}

const MESSAGES: Record<SignInErrorEnum, string> = {
    [SignInErrorEnum.Cancelled]: 'Sign-in was cancelled.',
    [SignInErrorEnum.Failed]: 'Sign-in failed. Please try again.',
    [SignInErrorEnum.Unavailable]: 'This sign-in method is currently unavailable.',
};

export function getSignInErrorMessage(code: string): string {
    return MESSAGES[code as SignInErrorEnum] ?? MESSAGES[SignInErrorEnum.Failed];
}
