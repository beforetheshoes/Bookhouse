import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, ImagePlus, Loader2, Search, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

interface WorkCoverProps {
  workId: string;
  coverPath: string | null;
  titleDisplay: string;
  maxPercent: number | null;
  coverVersion: number;
  onCoverUpdated: () => void;
  onCoverSearchOpen: () => void;
}

export function WorkCover({
  workId,
  coverPath,
  titleDisplay,
  maxPercent,
  coverVersion,
  onCoverUpdated,
  onCoverSearchOpen,
}: WorkCoverProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const showPlaceholder = !coverPath || imgFailed;

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/upload-cover/${workId}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }
      toast.success("Cover updated");
      setImgFailed(false);
      onCoverUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload cover");
    } finally {
      setUploadingCover(false);
      e.target.value = "";
    }
  }

  return (
    <div className="w-48 shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div
            className="group relative aspect-[2/3] cursor-pointer overflow-hidden rounded-lg bg-muted"
            role="button"
            tabIndex={0}
          >
            {showPlaceholder ? (
              <div data-testid="cover-placeholder" className="flex size-full items-center justify-center text-muted-foreground">
                <BookOpen className="size-12" />
              </div>
            ) : (
              <img
                src={`/api/covers/${workId}/medium?v=${String(coverVersion)}`}
                alt={titleDisplay}
                onError={() => { setImgFailed(true); }}
                className="size-full object-cover"
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              {uploadingCover ? (
                <Loader2 className="size-8 animate-spin text-white" />
              ) : (
                <ImagePlus className="size-8 text-white" />
              )}
            </div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem data-testid="cover-upload-option" onClick={() => { coverInputRef.current?.click(); }}>
            <Upload className="size-4 mr-2" />
            Upload from file
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="cover-search-option" onClick={onCoverSearchOpen}>
            <Search className="size-4 mr-2" />
            Search for cover
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="cover-file-input"
        onChange={(e) => { void handleCoverUpload(e); }}
      />
      {maxPercent !== null && (
        <div className="mt-2 text-center" data-testid="cover-progress">
          <span className="text-xl font-bold tabular-nums">{String(maxPercent)}%</span>
          <p className="text-xs text-muted-foreground">read</p>
        </div>
      )}
    </div>
  );
}
