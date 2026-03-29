import { useState, useRef } from "react";
import { Loader2, Download, Upload, Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import type { BackupManifest } from "~/lib/backup/manifest";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface BackupTabProps {
  history: BackupManifest[];
  onBackupComplete: (manifest: BackupManifest) => void;
}

export function BackupTab({ history, onBackupComplete }: BackupTabProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    try {
      const response = await fetch("/api/backup/download");
      if (!response.ok) {
        throw new Error("Backup failed");
      }

      const manifestHeader = response.headers.get("x-backup-manifest");
      const blob = await response.blob();

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookhouse-backup-${new Date().toISOString()}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (manifestHeader) {
        try {
          const manifest = JSON.parse(manifestHeader) as BackupManifest;
          onBackupComplete(manifest);
        } catch {
          // manifest header parse failed, non-critical
        }
      }

      toast.success("Backup created successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setIsCreating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRestoreFile(file);
      setConfirmOpen(true);
    }
  };

  const clearRestoreState = () => {
    setConfirmOpen(false);
    setRestoreFile(null);
    // fileInputRef is always attached when the component is mounted
    (fileInputRef.current as HTMLInputElement).value = "";
  };

  const handleRestore = async () => {
    // restoreFile is always set when the dialog is open
    const file = restoreFile as File;
    clearRestoreState();
    setIsRestoring(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/backup/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Restore failed");
      }

      toast.success("Backup restored successfully. Reloading...");
      setTimeout(() => { window.location.reload(); }, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Create Backup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Download a complete backup of your library database and cover images as a single archive file.
          </p>
          <Button onClick={() => { void handleCreateBackup(); }} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating backup...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Create Backup
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <CardTitle>Backup History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backups yet.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Database</th>
                    <th className="px-4 py-2 text-left font-medium">Covers</th>
                    <th className="px-4 py-2 text-left font-medium">Cover Size</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.timestamp} className="border-b last:border-b-0">
                      <td className="px-4 py-2">{formatDate(entry.timestamp)}</td>
                      <td className="px-4 py-2">{formatBytes(entry.databaseSize)}</td>
                      <td className="px-4 py-2">{entry.coverCount}</td>
                      <td className="px-4 py-2">{formatBytes(entry.coverSize)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Restore from Backup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a previously created backup archive to restore your library.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
            onChange={handleFileChange}
            disabled={isRestoring}
            data-testid="restore-file-input"
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
          />
          {isRestoring && (
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Restoring backup...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={clearRestoreState}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Backup</DialogTitle>
            <DialogDescription>
              This will overwrite all current data including your library database and cover images.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={clearRestoreState}>Cancel</Button>
            <Button variant="destructive" onClick={() => { void handleRestore(); }}>
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
