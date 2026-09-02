// Every Kobo route lives under /kobo/<device auth token>/…, so a raw request
// path is a bearer credential. Log a recognisable stub instead.
const KOBO_TOKEN_SEGMENT = /^(\/kobo\/)([^/]+)/;

export function redactKoboToken(pathname: string): string {
  return pathname.replace(
    KOBO_TOKEN_SEGMENT,
    (_match, prefix: string, token: string) => `${prefix}<token…${token.slice(-4)}>`,
  );
}
