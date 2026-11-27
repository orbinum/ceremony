/** Where GitHub's OAuth callback lands, on this origin. */
export const callbackUrl = (origin: string) => `${origin}/auth/github/callback`;
