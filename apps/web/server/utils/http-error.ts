// Build an h3-compatible HTTP error in place of the repeated
// `Object.assign(new Error(msg), { statusCode, statusMessage })`. The returned
// object is identical to that expression — statusMessage defaults to the
// message but may be given explicitly — so it stays a drop-in replacement.
export function httpError(
  message: string,
  statusCode: number,
  statusMessage: string = message,
): Error & { statusCode: number; statusMessage: string } {
  return Object.assign(new Error(message), { statusCode, statusMessage });
}
