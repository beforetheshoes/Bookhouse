import { useEffect, useRef, useState } from "react";
import { Upload as UploadIcon } from "lucide-react";

export interface GlobalUploadDropProps {
  enabled: boolean;
  onFilesDropped: (files: File[]) => void;
}

function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

// Window-level drop target: dragging files anywhere over the app shows a
// full-screen overlay, and dropping hands the files to onFilesDropped.
// Components with their own dropzone (the upload form) call
// stopPropagation in their drop handler to keep local drops local.
export function GlobalUploadDrop({ enabled, onFilesDropped }: GlobalUploadDropProps) {
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave fire for every nested element the cursor crosses;
  // only a balanced count of zero means the window was actually left.
  const depthRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    function handleDragEnter(event: DragEvent): void {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      depthRef.current += 1;
      setIsDragging(true);
    }

    function handleDragOver(event: DragEvent): void {
      if (!dragHasFiles(event)) return;
      // Without this the browser navigates to the dropped file.
      event.preventDefault();
    }

    function handleDragLeave(event: DragEvent): void {
      if (!dragHasFiles(event)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) {
        setIsDragging(false);
      }
    }

    function handleDrop(event: DragEvent): void {
      const transfer = event.dataTransfer;
      if (!transfer || !Array.from(transfer.types).includes("Files")) return;
      event.preventDefault();
      depthRef.current = 0;
      setIsDragging(false);
      const files = Array.from(transfer.files);
      if (files.length > 0) {
        onFilesDropped(files);
      }
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [enabled, onFilesDropped]);

  if (!isDragging) return null;

  return (
    <div
      data-testid="global-drop-overlay"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary bg-card px-12 py-10 shadow-lg">
        <UploadIcon className="size-10 text-primary" />
        <p className="text-lg font-medium">Drop files to upload</p>
        <p className="text-sm text-muted-foreground">
          Title and author are auto-detected from the file
        </p>
      </div>
    </div>
  );
}
