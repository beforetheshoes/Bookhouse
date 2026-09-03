import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Say exactly what happens - what is deleted, what cannot be undone. */
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Resolve when done; the dialog closes on success and stays open on failure. */
  onConfirm: () => Promise<boolean | undefined> | Promise<void>;
}

/**
 * One confirmation for every irreversible action, so they all behave the
 * same: the consequence is spelled out, the buttons disable while the work
 * runs, and the dialog cannot be dismissed mid-flight (Escape or overlay
 * used to close it while the delete carried on underneath).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      const outcome = await onConfirm();
      if (outcome !== false) onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); }} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => { void handleConfirm(); }}
            disabled={pending}
            data-testid="confirm-dialog-confirm"
          >
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
