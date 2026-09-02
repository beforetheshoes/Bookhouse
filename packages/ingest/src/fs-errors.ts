export interface NodeError extends Error {
  code?: string;
}

export function getErrorCode(error: NodeError): string | undefined {
  return error.code;
}

/** Transient infrastructure errors that should be retried, not permanently stored as "unparseable". */
export const TRANSIENT_ERROR_CODES = new Set([
  "ENOTCONN",    // socket not connected (NFS/network filesystem)
  "ECONNRESET",  // connection reset by peer
  "ECONNREFUSED",// connection refused
  "ETIMEDOUT",   // operation timed out
  "EIO",         // I/O error (disk/network issue)
  "EPIPE",       // broken pipe
  "ENETUNREACH", // network unreachable
  "EHOSTUNREACH",// host unreachable
  "ECONNABORTED",// connection aborted
]);

export function isTransientError(error: NodeError): boolean {
  const code = getErrorCode(error);
  return code !== undefined && TRANSIENT_ERROR_CODES.has(code);
}

/** Errors that mean the file itself could not be reached, as opposed to its contents being malformed. */
const FILE_ACCESS_ERROR_CODES = new Set(["ENOENT", "EACCES", "EPERM", "ENOTDIR", "EISDIR"]);

export function isFileAccessError(error: NodeError): boolean {
  const code = getErrorCode(error);
  return code !== undefined && (FILE_ACCESS_ERROR_CODES.has(code) || TRANSIENT_ERROR_CODES.has(code));
}
