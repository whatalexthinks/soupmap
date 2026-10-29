/**
 * Whether this browser may have a Clerk session, without loading Clerk: its readable
 * `__client_uat` cookie is "0" when signed out and a timestamp when signed in. A hint only:
 * the server still decides who someone is.
 */
export const maybeSignedIn = (): boolean => /(?:^|;\s*)__client_uat[^=]*=(?!0(?:;|$))[^;]+/.test(document.cookie);
