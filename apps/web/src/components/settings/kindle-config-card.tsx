import { useState, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  getKindleConfigServerFn,
  saveKindleConfigServerFn,
  removeKindleConfigServerFn,
} from "~/lib/server-fns/kindle";

export function KindleConfigCard({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!configured);
  const [loading, setLoading] = useState(configured);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    async function loadConfig() {
      try {
        const result = await getKindleConfigServerFn();
        if (cancelled) return;
        if (result.configured) {
          setStoredEmail(result.email);
          setEmail(result.email);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadConfig();
    return () => { cancelled = true; };
  }, [configured]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveKindleConfigServerFn({ data: { email } });
      toast.success("Kindle email saved");
      setEditing(false);
      void router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Kindle email");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeKindleConfigServerFn();
      toast.success("Kindle email removed");
      void router.invalidate();
    } catch {
      toast.error("Failed to remove Kindle email");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          Kindle
          <Badge variant={configured && !editing ? "default" : "secondary"}>
            {configured && !editing ? "Connected" : "Not configured"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading...
          </p>
        )}

        {loadError && (
          <p className="text-sm text-destructive">Failed to load configuration</p>
        )}

        {!loading && !loadError && editing && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Kindle Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); }}
                placeholder="you@kindle.com"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Add your sender email address to your Kindle&apos;s Approved Personal Document E-mail List in your Amazon account settings.
            </p>
            <Button
              onClick={() => { void handleSave(); }}
              disabled={saving || !email.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        )}

        {!loading && !loadError && !editing && storedEmail && (
          <>
            <div className="space-y-1 text-sm">
              <div className="flex gap-4">
                <span className="text-muted-foreground">Kindle email:</span>
                <span>{storedEmail}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditing(true); }}>
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void handleRemove(); }}
                disabled={removing}
              >
                {removing ? "Removing..." : "Remove"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
