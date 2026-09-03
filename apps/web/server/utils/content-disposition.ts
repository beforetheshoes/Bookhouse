// Header values are ByteStrings: a basename with a curly apostrophe or any
// non-Latin-1 character made `headers.set` throw and the download 500. RFC
// 6266 / 5987: an ASCII fallback in `filename=` plus the real name,
// percent-encoded, in `filename*=`.
export function attachmentDisposition(filename: string): string {
  // eslint-disable-next-line no-control-regex -- header-unsafe controls, quotes and backslashes
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/[\x00-\x1f"\\]/g, "_");
  const needsEncoding = fallback !== filename;
  const disposition = `attachment; filename="${fallback}"`;
  return needsEncoding
    ? `${disposition}; filename*=UTF-8''${encodeURIComponent(filename).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
    : disposition;
}
