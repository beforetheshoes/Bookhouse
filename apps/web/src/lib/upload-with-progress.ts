export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  /** Abort the request; the promise rejects with an "Upload cancelled" error. */
  signal?: AbortSignal;
  /** Injectable for tests. */
  createRequest?: () => XMLHttpRequest;
}

export interface UploadResult {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * POST a multipart body and report bytes sent as they go. fetch() cannot
 * observe upload progress, so a multi-GB audiobook showed a static
 * "Uploading…" for minutes with no way to tell whether it was moving.
 */
export function uploadWithProgress(url: string, body: FormData, options: UploadOptions = {}): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = options.createRequest ? options.createRequest() : new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.({ loaded: event.loaded, total: event.total });
    };
    xhr.onload = () => {
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText });
    };
    xhr.onerror = () => { reject(new Error("Network error during upload")); };
    xhr.onabort = () => { reject(new Error("Upload cancelled")); };

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener("abort", () => { xhr.abort(); }, { once: true });
    }

    xhr.send(body);
  });
}
