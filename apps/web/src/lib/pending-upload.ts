// Hand-off point between the global drag-and-drop target (anywhere in the
// app shell) and the upload form. Files dropped outside the upload page are
// stashed here, the router navigates to /upload, and the form takes them on
// mount. If the form is already mounted it subscribes, so drops anywhere on
// the upload page itself are delivered immediately instead of queued.

type PendingUploadListener = (files: File[]) => void;

let queue: File[] = [];
let listener: PendingUploadListener | null = null;

export function stashPendingUploadFiles(files: File[]): void {
  if (files.length === 0) return;
  if (listener !== null) {
    listener(files);
    return;
  }
  queue = [...queue, ...files];
}

export function takePendingUploadFiles(): File[] {
  const taken = queue;
  queue = [];
  return taken;
}

export function subscribePendingUploadFiles(callback: PendingUploadListener): () => void {
  listener = callback;
  return () => {
    if (listener === callback) {
      listener = null;
    }
  };
}
